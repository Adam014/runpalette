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
    expect(result.stdoutBytes + result.stderrBytes).toBe(160);
    expect(result.capturedBytes).toBe(100);
    expect(result.maxOutputBytes).toBe(100);
    expect(result.stdoutTruncated || result.stderrTruncated).toBe(true);
  });

  test("reports deterministic timing metadata", async () => {
    const dates = [new Date("2026-09-28T10:00:00.000Z"), new Date("2026-09-28T10:00:00.125Z")];
    const result = await executeCaptured(plan(["-e", "process.stdout.write('ok')"]), {
      maxOutputBytes: 1_024,
      now: () => dates.shift() ?? new Date("2026-09-28T10:00:00.125Z"),
    });

    expect(result).toMatchObject({
      startedAt: "2026-09-28T10:00:00.000Z",
      finishedAt: "2026-09-28T10:00:00.125Z",
      durationMs: 125,
      stdout: "ok",
      stdoutBytes: 2,
      stderrBytes: 0,
      capturedBytes: 2,
      timedOut: false,
      aborted: false,
      truncated: false,
    });
  });

  test("never returns a partial UTF-8 code point at the capture boundary", async () => {
    const result = await executeCaptured(plan(["-e", "process.stdout.write('😀')"]), {
      maxOutputBytes: 3,
    });

    expect(result.stdout).toBe("");
    expect(result.stdoutBytes).toBe(4);
    expect(result.capturedBytes).toBe(3);
    expect(result.stdoutTruncated).toBe(true);
  });

  test("terminates commands after the requested timeout", async () => {
    const started = performance.now();
    const result = await executeCaptured(plan(["-e", "setInterval(() => {}, 1000)"]), {
      timeoutMs: 50,
      maxOutputBytes: 1_024,
    });

    expect(result.timedOut).toBe(true);
    expect(result.aborted).toBe(false);
    expect(performance.now() - started).toBeLessThan(2_000);
  });

  test("does not spawn when its signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const result = await executeCaptured(plan([], "runpalette-executable-that-does-not-exist"), {
      maxOutputBytes: 1_024,
      signal: controller.signal,
    });

    expect(result).toMatchObject({
      exitCode: 130,
      signal: null,
      timedOut: false,
      aborted: true,
      capturedBytes: 0,
    });
  });

  test("terminates a running command when its signal is aborted", async () => {
    const controller = new AbortController();
    const started = performance.now();
    const execution = executeCaptured(plan(["-e", "setInterval(() => {}, 1000)"]), {
      maxOutputBytes: 1_024,
      signal: controller.signal,
    });
    setTimeout(() => controller.abort(), 50);
    const result = await execution;

    expect(result.aborted).toBe(true);
    expect(result.timedOut).toBe(false);
    expect(result.exitCode).not.toBe(0);
    expect(performance.now() - started).toBeLessThan(2_000);
  });

  test("rejects invalid capture bounds before spawning", () => {
    expect(() => executeCaptured(plan([]), { maxOutputBytes: 0 })).toThrow(RangeError);
    expect(() => executeCaptured(plan([]), { maxOutputBytes: 1_024, timeoutMs: 0 })).toThrow(
      RangeError,
    );
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
