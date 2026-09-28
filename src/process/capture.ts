import { constants } from "node:os";
import spawn from "cross-spawn";
import { RunpaletteError } from "../core/errors.js";
import type { ExecutionPlan } from "../core/model.js";
import { terminateProcessTree } from "./terminate.js";

export interface CapturedExecution {
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  exitCode: number;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  stdoutBytes: number;
  stderrBytes: number;
  capturedBytes: number;
  maxOutputBytes: number;
  timedOut: boolean;
  aborted: boolean;
  truncated: boolean;
  stdoutTruncated: boolean;
  stderrTruncated: boolean;
}

export interface CapturedExecutionOptions {
  timeoutMs?: number;
  maxOutputBytes: number;
  signal?: AbortSignal;
  now?: () => Date;
}

function safeUtf8(buffer: Buffer): string {
  if (buffer.length === 0) return "";
  let sequenceStart = buffer.length - 1;
  while (sequenceStart >= 0 && (buffer[sequenceStart] ?? 0) >> 6 === 0b10) sequenceStart -= 1;
  if (sequenceStart < 0) return "";
  const lead = buffer[sequenceStart] ?? 0;
  const expected =
    lead >> 7 === 0
      ? 1
      : lead >> 5 === 0b110
        ? 2
        : lead >> 4 === 0b1110
          ? 3
          : lead >> 3 === 0b11110
            ? 4
            : 1;
  const available = buffer.length - sequenceStart;
  return buffer.subarray(0, available < expected ? sequenceStart : buffer.length).toString("utf8");
}

function signalExitCode(signal: NodeJS.Signals | null): number {
  if (signal === null) return 1;
  const number = constants.signals[signal];
  return number === undefined ? 128 : 128 + number;
}

export function executeCaptured(
  plan: ExecutionPlan,
  options: CapturedExecutionOptions,
): Promise<CapturedExecution> {
  if (!Number.isSafeInteger(options.maxOutputBytes) || options.maxOutputBytes < 1) {
    throw new RangeError("maxOutputBytes must be a positive safe integer");
  }
  if (
    options.timeoutMs !== undefined &&
    (!Number.isSafeInteger(options.timeoutMs) || options.timeoutMs < 1)
  ) {
    throw new RangeError("timeoutMs must be a positive safe integer when provided");
  }

  const now = options.now ?? (() => new Date());
  const started = now();
  const startedAt = started.toISOString();
  if (options.signal?.aborted === true) {
    return Promise.resolve({
      startedAt,
      finishedAt: startedAt,
      durationMs: 0,
      exitCode: 130,
      signal: null,
      stdout: "",
      stderr: "",
      stdoutBytes: 0,
      stderrBytes: 0,
      capturedBytes: 0,
      maxOutputBytes: options.maxOutputBytes,
      timedOut: false,
      aborted: true,
      truncated: false,
      stdoutTruncated: false,
      stderrTruncated: false,
    });
  }

  return new Promise((resolve, reject) => {
    const child = spawn(plan.executable, plan.args, {
      cwd: plan.cwd,
      env: process.env,
      detached: process.platform !== "win32",
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let capturedBytes = 0;
    let stdoutTruncated = false;
    let stderrTruncated = false;
    let timedOut = false;
    let aborted = false;
    let terminating = false;
    let settled = false;
    let timeoutTimer: NodeJS.Timeout | undefined;
    let escalationTimer: NodeJS.Timeout | undefined;

    const append = (stream: "stdout" | "stderr", chunk: Buffer): void => {
      if (stream === "stdout") stdoutBytes += chunk.byteLength;
      else stderrBytes += chunk.byteLength;
      const remaining = Math.max(0, options.maxOutputBytes - capturedBytes);
      const accepted = Math.min(remaining, chunk.byteLength);
      if (accepted > 0) {
        (stream === "stdout" ? stdoutChunks : stderrChunks).push(chunk.subarray(0, accepted));
        capturedBytes += accepted;
      }
      if (accepted < chunk.byteLength) {
        if (stream === "stdout") stdoutTruncated = true;
        else stderrTruncated = true;
      }
    };

    const terminate = (reason: "timeout" | "abort"): void => {
      if (terminating || settled) return;
      terminating = true;
      timedOut = reason === "timeout";
      aborted = reason === "abort";
      terminateProcessTree(child, "SIGTERM");
      escalationTimer = setTimeout(() => terminateProcessTree(child, "SIGKILL", true), 1_000);
      escalationTimer.unref?.();
    };
    const abort = (): void => terminate("abort");
    const cleanup = (): void => {
      if (timeoutTimer !== undefined) clearTimeout(timeoutTimer);
      if (escalationTimer !== undefined) clearTimeout(escalationTimer);
      options.signal?.removeEventListener("abort", abort);
    };

    child.stdout?.on("data", (chunk: Buffer) => append("stdout", chunk));
    child.stderr?.on("data", (chunk: Buffer) => append("stderr", chunk));
    child.once("error", (error) => {
      if (settled) return;
      settled = true;
      cleanup();
      const code = (error as NodeJS.ErrnoException).code;
      reject(
        code === "ENOENT"
          ? new RunpaletteError(
              "EXECUTABLE_NOT_FOUND",
              `Cannot find the ${plan.executable} executable.`,
              `Install ${plan.executable} or make it available on PATH.`,
            )
          : error,
      );
    });
    child.once("close", (code, signal) => {
      if (settled) return;
      settled = true;
      cleanup();
      const finished = now();
      resolve({
        startedAt,
        finishedAt: finished.toISOString(),
        durationMs: Math.max(0, finished.getTime() - started.getTime()),
        exitCode: code ?? signalExitCode(signal),
        signal,
        stdout: safeUtf8(Buffer.concat(stdoutChunks)),
        stderr: safeUtf8(Buffer.concat(stderrChunks)),
        stdoutBytes,
        stderrBytes,
        capturedBytes,
        maxOutputBytes: options.maxOutputBytes,
        timedOut,
        aborted,
        truncated: stdoutTruncated || stderrTruncated,
        stdoutTruncated,
        stderrTruncated,
      });
    });

    options.signal?.addEventListener("abort", abort, { once: true });
    if (options.timeoutMs !== undefined) {
      timeoutTimer = setTimeout(() => terminate("timeout"), options.timeoutMs);
      timeoutTimer.unref?.();
    }
  });
}
