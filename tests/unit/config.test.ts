import { afterEach, describe, expect, test } from "bun:test";
import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { configurationSelectors, createCatalog } from "../../src/core/catalog.js";
import {
  commandConfig,
  configTemplate,
  createConfigValidationReport,
  initializeConfig,
  loadConfig,
  parseConfig,
} from "../../src/core/config.js";
import type { ProjectContext } from "../../src/core/model.js";
import { createProject } from "../helpers/project.js";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function project(): ProjectContext {
  return {
    root: "/repo",
    manifestPath: "/repo/package.json",
    name: "repo",
    manifest: { name: "repo", scripts: { dev: "vite", release: "npm publish", secret: "x" } },
    packageManager: {
      name: "npm",
      evidence: { source: "packageManager", detail: "npm@12" },
      warnings: [],
    },
    workspaces: [],
  };
}

describe("Runpalette configuration", () => {
  test("customizes command presentation, aliases, safety, and the default", () => {
    const config = parseConfig({
      schemaVersion: 1,
      default: "serve",
      groups: { shipping: { label: "Ship safely", order: -5 } },
      commands: {
        dev: { label: "Start app", description: "Open the local app", aliases: ["serve"] },
        release: { group: "shipping", order: 1, confirm: "This publishes the package." },
        secret: { hidden: true },
      },
    });
    const catalog = createCatalog(project(), config);

    expect(catalog.commands.map(({ name, label }) => [name, label])).toEqual([
      ["dev", "Start app"],
      ["release", "release"],
    ]);
    expect(catalog.groups[0]?.label).toBe("Ship safely");
    expect(catalog.commands[1]?.safety).toEqual({
      confirmationRequired: true,
      message: "This publishes the package.",
    });
    expect(catalog.hidden).toContainEqual({ name: "secret", workspace: ".", reason: "config" });
    expect(catalog.defaultCommandId).toBe(catalog.commands[0]?.id);
  });

  test("fails closed for unknown fields and duplicate aliases", () => {
    expect(() => parseConfig({ schemaVersion: 1, surprise: true })).toThrow("unknown field");
    expect(() =>
      createCatalog(
        project(),
        parseConfig({
          schemaVersion: 1,
          commands: { dev: { aliases: ["release"] } },
        }),
      ),
    ).toThrow("shared by dev and release");
  });

  test("rejects malformed values at their exact configuration path", () => {
    const invalid = [
      null,
      { schemaVersion: 2 },
      { schemaVersion: 1, default: "" },
      { schemaVersion: 1, groups: [] },
      { schemaVersion: 1, groups: { "Bad group": {} } },
      { schemaVersion: 1, groups: { ship: { label: 1 } } },
      { schemaVersion: 1, groups: { ship: { order: Number.POSITIVE_INFINITY } } },
      { schemaVersion: 1, commands: [] },
      { schemaVersion: 1, commands: { "": {} } },
      { schemaVersion: 1, commands: { dev: { hidden: "yes" } } },
      { schemaVersion: 1, commands: { dev: { aliases: "serve" } } },
      { schemaVersion: 1, commands: { dev: { aliases: [""] } } },
      { schemaVersion: 1, commands: { dev: { aliases: ["serve", "serve"] } } },
      { schemaVersion: 1, commands: { dev: { confirm: "" } } },
      { schemaVersion: 1, commands: { dev: { surprise: true } } },
    ];
    for (const value of invalid) expect(() => parseConfig(value)).toThrow();
  });

  test("loads default, explicit, and malformed configuration files", async () => {
    const root = await createProject({ manifest: { name: "app" } });
    roots.push(root);

    expect(await loadConfig({ root })).toEqual({ schemaVersion: 1, groups: {}, commands: {} });
    await expect(loadConfig({ root, path: "missing-runpalette.json" })).rejects.toMatchObject({
      code: "CONFIG_READ_FAILED",
    });

    const path = join(root, "runpalette.json");
    await writeFile(path, "{ invalid");
    await expect(loadConfig({ root })).rejects.toMatchObject({ code: "CONFIG_INVALID" });
    await writeFile(path, JSON.stringify({ schemaVersion: 1, default: "dev" }));
    expect(await loadConfig({ root })).toMatchObject({ default: "dev", path });
  });

  test("merges general command metadata with workspace-specific overrides", () => {
    const config = parseConfig({
      schemaVersion: 1,
      commands: {
        test: { label: "Test everything", group: "quality" },
        "@acme/web#test": { label: "Test web", confirm: true },
        "packages/api#test": { description: "Test API" },
      },
    });

    expect(commandConfig(config, "@acme/web", "packages/web", "test")).toMatchObject({
      label: "Test web",
      group: "quality",
      confirm: true,
    });
    expect(commandConfig(config, "@acme/api", "packages/api", "test")).toMatchObject({
      label: "Test everything",
      description: "Test API",
    });
  });

  test("creates a minimal versioned config without overwriting by default", async () => {
    const root = await createProject({ manifest: { name: "app" } });
    roots.push(root);
    const initialized = await initializeConfig({ root, version: "1.2.3" });

    expect(initialized.overwritten).toBe(false);
    expect(JSON.parse(await readFile(initialized.path, "utf8"))).toEqual({
      $schema: "https://unpkg.com/runpalette@1.2.3/schema/runpalette.schema.json",
      schemaVersion: 1,
      groups: {},
      commands: {},
    });
    expect(configTemplate("1.2.3")).toEndWith("\n");
    await expect(initializeConfig({ root, version: "2.0.0" })).rejects.toMatchObject({
      code: "CONFIG_EXISTS",
    });
    const overwritten = await initializeConfig({ root, version: "2.0.0", force: true });
    expect(overwritten.overwritten).toBe(true);
    expect(await readFile(initialized.path, "utf8")).toContain("runpalette@2.0.0");
  });

  test("reports stale selectors without rejecting an otherwise valid config", () => {
    const config = parseConfig({
      schemaVersion: 1,
      commands: { dev: { label: "Develop" }, missing: { hidden: true } },
    });
    config.path = "/repo/runpalette.json";
    const catalog = createCatalog(project(), config);
    const report = createConfigValidationReport(
      config,
      catalog,
      "/repo",
      configurationSelectors(project(), []),
    );

    expect(report).toMatchObject({
      status: "warning",
      path: "runpalette.json",
      configured: { commands: 2 },
      discovered: { runnableCommands: 3 },
      unmatchedSelectors: ["missing"],
    });
    expect(() =>
      createConfigValidationReport(
        { schemaVersion: 1, groups: {}, commands: {} },
        createCatalog(project()),
        "/repo",
        configurationSelectors(project(), []),
      ),
    ).toThrow("No Runpalette configuration");
  });
});
