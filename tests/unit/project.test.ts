import { describe, expect, test } from "bun:test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { RunpaletteError } from "../../src/core/errors.js";
import { discoverProject } from "../../src/core/project.js";
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
});
