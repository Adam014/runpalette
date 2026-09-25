import { describe, expect, test } from "bun:test";
import { executePlan } from "../../src/process/run.js";

describe("executePlan", () => {
  test("turns a missing package-manager executable into an actionable error", async () => {
    expect(
      executePlan({
        schemaVersion: 1,
        command: "run",
        script: { name: "test", value: "test" },
        packageManager: "npm",
        executable: "runpalette-manager-that-does-not-exist",
        args: ["run", "test"],
        cwd: process.cwd(),
      }),
    ).rejects.toMatchObject({
      code: "PACKAGE_MANAGER_NOT_FOUND",
      message: "Cannot find the npm executable.",
    });
  });
});
