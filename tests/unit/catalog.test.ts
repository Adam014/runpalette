import { describe, expect, test } from "bun:test";
import {
  catalogForOutput,
  classifyCommand,
  commandMatchesWorkspace,
  createCatalog,
  filterCatalog,
} from "../../src/core/catalog.js";
import { parseConfig } from "../../src/core/config.js";
import type { ProjectContext } from "../../src/core/model.js";

function project(scripts: Record<string, string>): ProjectContext {
  return {
    root: "/workspace/example",
    manifestPath: "/workspace/example/package.json",
    name: "example",
    manifest: { name: "example", scripts },
    packageManager: {
      name: "bun",
      evidence: { source: "lockfile", detail: "bun.lock" },
      warnings: [],
    },
    workspaces: [],
  };
}

describe("createCatalog", () => {
  test("groups scripts by outcome while preserving manifest order", () => {
    const catalog = createCatalog(
      project({
        dev: "vite",
        "test:unit": "vitest",
        build: "tsc",
        "db:migrate": "drizzle-kit migrate",
        mystery: "node mystery.js",
      }),
    );

    expect(catalog.commands.map(({ name, group }) => [name, group])).toEqual([
      ["dev", "develop"],
      ["test:unit", "quality"],
      ["build", "build"],
      ["db:migrate", "operations"],
      ["mystery", "other"],
    ]);
    expect(catalog.groups.map((group) => group.label)).toEqual([
      "Start & develop",
      "Test & quality",
      "Build & release",
      "Data & operations",
      "Other",
    ]);
  });

  test("hides automatic lifecycle scripts and a recursive what alias", () => {
    const catalog = createCatalog(
      project({
        prebuild: "node prepare.js",
        build: "tsc",
        postbuild: "node report.js",
        what: "runpalette",
        test: "vitest",
      }),
    );

    expect(catalog.commands.map((command) => command.name)).toEqual(["build", "test"]);
    expect(catalog.hidden).toEqual([
      { name: "prebuild", workspace: ".", reason: "lifecycle" },
      { name: "postbuild", workspace: ".", reason: "lifecycle" },
      { name: "what", workspace: ".", reason: "self" },
    ]);
  });

  test("hides npm lifecycle hooks that run automatically", () => {
    const catalog = createCatalog(
      project({
        prepare: "husky",
        prepack: "tsc",
        postinstall: "patch-package",
        preview: "vite preview",
        publish: "node publish.js",
      }),
    );

    expect(catalog.commands.map((command) => command.name)).toEqual(["preview", "publish"]);
    expect(catalog.hidden).toEqual([
      { name: "prepare", workspace: ".", reason: "lifecycle" },
      { name: "prepack", workspace: ".", reason: "lifecycle" },
      { name: "postinstall", workspace: ".", reason: "lifecycle" },
    ]);
  });

  test("does not hide unrelated pre-prefixed scripts", () => {
    const catalog = createCatalog(project({ preview: "vite preview", preflight: "node check.js" }));

    expect(catalog.commands.map((command) => command.name)).toEqual(["preview", "preflight"]);
  });
});

describe("classifyCommand", () => {
  test("matches complete tokens instead of substrings", () => {
    expect(classifyCommand("contest")).toBe("other");
    expect(classifyCommand("test:watch")).toBe("quality");
    expect(classifyCommand("releaseCandidate")).toBe("build");
  });
});

describe("configured and workspace catalogs", () => {
  test("sorts custom groups and commands and qualifies an ambiguous default", () => {
    const value = project({ check: "node check.js" });
    value.workspaces = [
      {
        name: "@acme/web",
        root: "/workspace/example/packages/web",
        manifestPath: "/workspace/example/packages/web/package.json",
        relativePath: "packages/web",
        manifest: { name: "@acme/web", scripts: { dev: "vite", check: "vitest" } },
      },
    ];
    const config = parseConfig({
      schemaVersion: 1,
      default: "@acme/web#serve",
      groups: { local: { label: "Local workflows", order: -1 } },
      commands: {
        dev: { aliases: ["serve"], group: "local", order: 20 },
        "@acme/web#dev": { label: "Open web", order: 1 },
      },
    });

    const catalog = createCatalog(value, config);
    expect(catalog.groups[0]?.label).toBe("Local workflows");
    expect(catalog.groups[0]?.commands[0]?.label).toBe("Open web");
    expect(catalog.defaultCommandId).toBe("package:packages/web:dev");
    const workspaceCommand = catalog.commands[1];
    if (workspaceCommand === undefined) throw new Error("Expected a workspace command");
    expect(commandMatchesWorkspace(workspaceCommand, "@acme/web")).toBe(true);
    expect(commandMatchesWorkspace(workspaceCommand, "packages/web")).toBe(true);
  });

  test("rejects missing and ambiguous defaults", () => {
    const value = project({ dev: "vite" });
    value.workspaces = [
      {
        name: "web",
        root: "/workspace/example/web",
        manifestPath: "/workspace/example/web/package.json",
        relativePath: "web",
        manifest: { name: "web", scripts: { dev: "vite" } },
      },
    ];
    expect(() =>
      createCatalog(value, parseConfig({ schemaVersion: 1, default: "missing" })),
    ).toThrow("does not match");
    expect(() => createCatalog(value, parseConfig({ schemaVersion: 1, default: "dev" }))).toThrow(
      "ambiguous",
    );
  });

  test("filters by group and workspace and reports invalid selectors", () => {
    const value = project({ dev: "vite", test: "vitest" });
    const catalog = createCatalog(value);

    expect(filterCatalog(catalog, { group: "quality" }).commands.map(({ name }) => name)).toEqual([
      "test",
    ]);
    expect(filterCatalog(catalog, { workspace: "root" }).commands).toHaveLength(2);
    expect(() => filterCatalog(catalog, { group: "missing" })).toThrow("was not found");
    expect(() => filterCatalog(catalog, { workspace: "missing" })).toThrow("was not found");
  });

  test("emits invocation-relative paths without mutating the internal catalog", () => {
    const catalog = createCatalog(project({ dev: "vite" }));
    const output = catalogForOutput(catalog, "/workspace");

    expect(output.project.root).toBe("example");
    expect(output.project.manifestPath).toBe("example/package.json");
    expect(output.commands[0]?.workspace.root).toBe("example");
    expect(catalog.project.root).toBe("/workspace/example");
  });
});
