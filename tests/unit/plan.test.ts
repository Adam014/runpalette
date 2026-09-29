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
    requirements: { environment: [], executables: [] },
    workspace: { name: "repo", path: ".", root: "/repo", isRoot: true },
    source: { kind: "package" as const, path: "/repo/package.json" },
    execution: {
      executable: packageManager,
      args: ["run", "test"],
      ...(packageManager === "npm" ? { forwardedArgsSeparator: "--" } : {}),
    },
  };
  return {
    schemaVersion: 1,
    project: { name: "repo", root: "/repo", manifestPath: "/repo/package.json", workspaceCount: 0 },
    packageManager: {
      name: packageManager,
      evidence: { source: "explicit", detail: packageManager },
      warnings: [],
    },
    sources: ["package"],
    diagnostics: [],
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
      'Command or alias "build" was not found',
    );
  });

  test("resolves an alias and keeps the canonical script name", () => {
    const value = catalog("pnpm");
    value.commands[0]?.aliases.push("check");
    const plan = createExecutionPlan(value, "check", []);

    expect(plan.script).toEqual({ name: "test", value: "vitest", requestedAs: "check" });
    expect(plan.args).toEqual(["run", "test"]);
  });

  test("reports declared command readiness without exposing environment values", () => {
    const value = catalog("npm");
    const command = value.commands[0];
    if (command === undefined) throw new Error("Fixture invariant failed.");
    command.requirements = {
      environment: ["RUNPALETTE_TEST_MISSING_ENV"],
      executables: [process.execPath, "runpalette-test-missing-executable"],
    };

    const plan = createExecutionPlan(value, "test", []);

    expect(plan.requirements).toEqual(command.requirements);
    expect(plan.readiness).toEqual({
      ready: false,
      missingEnvironment: ["RUNPALETTE_TEST_MISSING_ENV"],
      missingExecutables: ["runpalette-test-missing-executable"],
    });
  });
});
