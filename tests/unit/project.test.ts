import { describe, expect, test } from "bun:test";
import { mkdir, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { RunpaletteError } from "../../src/core/errors.js";
import { discoverProject, parseManifest } from "../../src/core/project.js";
import { createProject } from "../helpers/project.js";

describe("discoverProject", () => {
  test("walks upward and respects the declared package manager", async () => {
    const root = await createProject({
      manifest: {
        name: "sample-app",
        packageManager: "pnpm@10.17.1",
        scripts: { dev: "vite" },
      },
    });
    const nested = join(root, "apps", "web", "src");
    await mkdir(nested, { recursive: true });

    const project = await discoverProject({ cwd: nested });

    expect(project.root).toBe(root);
    expect(project.name).toBe("sample-app");
    expect(project.packageManager).toEqual({
      name: "pnpm",
      evidence: { source: "packageManager", detail: "pnpm@10.17.1" },
      warnings: [],
    });
  });

  test("reports conflicting lockfiles while choosing deterministically", async () => {
    const root = await createProject({
      manifest: { name: "mixed", scripts: { test: "vitest" } },
      files: { "bun.lock": "", "package-lock.json": "{}" },
    });

    const project = await discoverProject({ cwd: root });

    expect(project.packageManager.name).toBe("bun");
    expect(project.packageManager.evidence.detail).toBe("bun.lock");
    expect(project.packageManager.warnings[0]).toContain("Conflicting lockfiles");
  });

  test("explicit package manager overrides project metadata", async () => {
    const root = await createProject({
      manifest: { packageManager: "npm@11", scripts: {} },
    });

    const project = await discoverProject({ cwd: root, packageManager: "yarn" });

    expect(project.packageManager).toEqual({
      name: "yarn",
      evidence: { source: "explicit", detail: "--package-manager yarn" },
      warnings: [],
    });
  });

  test("rejects malformed scripts without silently dropping them", async () => {
    const root = await createProject({ manifest: { scripts: { test: 42 } } });

    await expect(discoverProject({ cwd: root })).rejects.toMatchObject({
      code: "SCRIPTS_INVALID",
    });
  });

  test("reports malformed JSON as a product error", async () => {
    const root = await createProject({ manifest: {} });
    await writeFile(join(root, "package.json"), "{ not-json");

    try {
      await discoverProject({ cwd: root });
      throw new Error("Expected discovery to fail.");
    } catch (error) {
      expect(error).toBeInstanceOf(RunpaletteError);
      expect((error as RunpaletteError).code).toBe("MANIFEST_INVALID");
    }
  });

  test("discovers a workspace root and every declared package from a nested directory", async () => {
    const root = await createProject({
      manifest: {
        name: "monorepo",
        packageManager: "pnpm@12",
        workspaces: ["packages/*"],
        scripts: { check: "node check.js" },
      },
      files: {
        "packages/api/package.json": JSON.stringify({
          name: "@acme/api",
          scripts: { test: "vitest" },
        }),
        "packages/web/package.json": JSON.stringify({
          name: "@acme/web",
          scripts: { dev: "vite" },
        }),
        "packages/web/src/index.ts": "",
      },
    });

    const project = await discoverProject({ cwd: join(root, "packages/web/src") });

    expect(project.root).toBe(root);
    expect(project.workspaces.map(({ name, relativePath }) => [name, relativePath])).toEqual([
      ["@acme/api", "packages/api"],
      ["@acme/web", "packages/web"],
    ]);
  });

  test("reads pnpm workspace patterns and honors exclusions", async () => {
    const root = await createProject({
      manifest: { name: "pnpm-root", scripts: {} },
      files: {
        "pnpm-workspace.yaml": "packages:\n  - 'apps/*'\n  - '!apps/private'\n",
        "apps/public/package.json": JSON.stringify({ name: "public", scripts: { dev: "vite" } }),
        "apps/private/package.json": JSON.stringify({ name: "private", scripts: { dev: "vite" } }),
      },
    });

    const project = await discoverProject({ cwd: join(root, "apps/public") });
    expect(project.workspaces.map(({ name }) => name)).toEqual(["public"]);
  });

  test("accepts package workspace objects and falls back to directory names", async () => {
    const root = await createProject({
      manifest: { workspaces: { packages: ["modules/*"] }, scripts: {} },
      files: {
        "modules/unnamed/package.json": JSON.stringify({ scripts: { test: "node test.js" } }),
      },
    });

    const project = await discoverProject({ cwd: join(root, "modules/unnamed") });
    expect(project.name).toBe(basename(root));
    expect(project.workspaces[0]?.name).toBe("modules/unnamed");
  });

  test("rejects missing projects and invalid manifest shapes", async () => {
    const root = await createProject({ manifest: {} });
    await expect(discoverProject({ cwd: join(root, "missing") })).rejects.toMatchObject({
      code: "PROJECT_PATH_INVALID",
    });
    expect(() => parseManifest("[]", "/repo/package.json")).toThrow("JSON object");
    expect(() => parseManifest(JSON.stringify({ scripts: [] }), "/repo/package.json")).toThrow(
      "scripts field",
    );
  });

  test("rejects malformed workspace declarations and pnpm workspace files", async () => {
    const invalidPackage = await createProject({ manifest: { workspaces: "packages/*" } });
    await expect(discoverProject({ cwd: invalidPackage })).rejects.toMatchObject({
      code: "MANIFEST_INVALID",
    });

    const invalidPnpm = await createProject({
      manifest: {},
      files: { "pnpm-workspace.yaml": "packages: not-an-array\n" },
    });
    await expect(discoverProject({ cwd: invalidPnpm })).rejects.toMatchObject({
      code: "MANIFEST_INVALID",
    });

    const brokenYaml = await createProject({
      manifest: {},
      files: { "pnpm-workspace.yaml": "packages: [\n" },
    });
    await expect(discoverProject({ cwd: brokenYaml })).rejects.toMatchObject({
      code: "MANIFEST_INVALID",
    });
  });
});
