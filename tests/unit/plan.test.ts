import { describe, expect, test } from "bun:test";
import type { CommandCatalog, PackageManagerName } from "../../src/core/model.js";
import { createExecutionPlan } from "../../src/core/plan.js";

function catalog(packageManager: PackageManagerName): CommandCatalog {
  const command = {
    id: "package:test",
    name: "test",
    label: "test",
    aliases: [],
    script: "vitest",
    group: "quality" as const,
    order: 0,
    safety: { confirmationRequired: false },
    workspace: { name: "repo", path: ".", root: "/repo", isRoot: true },
    source: { kind: "package.json" as const, path: "/repo/package.json" },
  };
  return {
    schemaVersion: 1,
    project: { name: "repo", root: "/repo", manifestPath: "/repo/package.json", workspaceCount: 0 },
    packageManager: {
      name: packageManager,
      evidence: { source: "explicit", detail: packageManager },
      warnings: [],
    },
    groups: [{ id: "quality", label: "Test & quality", commands: [command] }],
    commands: [command],
    hidden: [],
  };
}

describe("createExecutionPlan", () => {
  test.each([
    ["npm", ["run", "test", "--", "--watch"]],
    ["pnpm", ["run", "test", "--watch"]],
    ["yarn", ["run", "test", "--watch"]],
    ["bun", ["run", "test", "--watch"]],
  ] as const)("builds the %s delegation without a shell", (manager, expectedArgs) => {
    const plan = createExecutionPlan(catalog(manager), "test", ["--watch"]);

    expect(plan.executable).toBe(manager);
    expect(plan.args).toEqual([...expectedArgs]);
    expect(plan.cwd).toBe("/repo");
  });

  test("returns an actionable missing-command error", () => {
    expect(() => createExecutionPlan(catalog("npm"), "build", [])).toThrow(
      'Script or alias "build" was not found',
    );
  });

  test("resolves an alias and keeps the canonical script name", () => {
    const value = catalog("pnpm");
    value.commands[0]?.aliases.push("check");
    const plan = createExecutionPlan(value, "check", []);

    expect(plan.script).toEqual({ name: "test", value: "vitest", requestedAs: "check" });
    expect(plan.args).toEqual(["run", "test"]);
  });
});
