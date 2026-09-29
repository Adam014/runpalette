import { describe, expect, test } from "bun:test";
import { executePlan } from "../../src/process/run.js";

describe("executePlan", () => {
  test("turns a missing package-manager executable into an actionable error", async () => {
    expect(
      executePlan({
        schemaVersion: 1,
        command: "run",
        script: { name: "test", value: "test", requestedAs: "test" },
        workspace: { name: "repo", path: ".", root: process.cwd(), isRoot: true },
        safety: { confirmationRequired: false },
        requirements: { environment: [], executables: [] },
        readiness: { ready: true, missingEnvironment: [], missingExecutables: [] },
        source: { kind: "package", path: "package.json" },
        packageManager: "npm",
        executable: "runpalette-manager-that-does-not-exist",
        args: ["run", "test"],
        cwd: process.cwd(),
      }),
    ).rejects.toMatchObject({
      code: "EXECUTABLE_NOT_FOUND",
      message: "Cannot find the runpalette-manager-that-does-not-exist executable.",
    });
  });
});
