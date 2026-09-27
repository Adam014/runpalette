import { describe, expect, test } from "bun:test";
import type { ExecutionPlan } from "../../src/core/model.js";
import { executeCaptured } from "../../src/process/capture.js";

function plan(args: string[], executable = process.execPath): ExecutionPlan {
  return {
    schemaVersion: 1,
    command: "run",
    script: { name: "fixture", value: "fixture", requestedAs: "fixture" },
    workspace: { name: "fixture", path: ".", root: process.cwd(), isRoot: true },
    safety: { confirmationRequired: false },
    source: { kind: "package", path: "package.json" },
    executable,
    args,
    cwd: process.cwd(),
  };
}

describe("executeCaptured", () => {
  test("bounds combined output without losing execution metadata", async () => {
    const result = await executeCaptured(
      plan(["-e", "process.stdout.write('a'.repeat(80)); process.stderr.write('b'.repeat(80))"]),
      { timeoutMs: 5_000, maxOutputBytes: 100 },
    );

    expect(result.exitCode).toBe(0);
    expect(result.truncated).toBe(true);
    expect(Buffer.byteLength(result.stdout) + Buffer.byteLength(result.stderr)).toBe(100);
  });

  test("terminates commands after the requested timeout", async () => {
    const started = performance.now();
    const result = await executeCaptured(plan(["-e", "setInterval(() => {}, 1000)"]), {
      timeoutMs: 50,
      maxOutputBytes: 1_024,
    });

    expect(result.timedOut).toBe(true);
    expect(performance.now() - started).toBeLessThan(2_000);
  });

  test("reports a missing executable as an actionable product error", () => {
    expect(
      executeCaptured(plan([], "runpalette-executable-that-does-not-exist"), {
        timeoutMs: 1_000,
        maxOutputBytes: 1_024,
      }),
    ).rejects.toMatchObject({ code: "EXECUTABLE_NOT_FOUND" });
  });
});
