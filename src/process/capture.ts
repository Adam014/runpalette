import spawn from "cross-spawn";
import { RunpaletteError } from "../core/errors.js";
import type { ExecutionPlan } from "../core/model.js";
import { terminateProcessTree } from "./terminate.js";

export interface CapturedExecution {
  exitCode: number;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  truncated: boolean;
}

export function executeCaptured(
  plan: ExecutionPlan,
  options: { timeoutMs: number; maxOutputBytes: number },
): Promise<CapturedExecution> {
  return new Promise((resolve, reject) => {
    const child = spawn(plan.executable, plan.args, {
      cwd: plan.cwd,
      env: process.env,
      detached: true,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let bytes = 0;
    let truncated = false;
    let timedOut = false;
    let settled = false;
    let timeoutTimer: NodeJS.Timeout | undefined;
    let escalationTimer: NodeJS.Timeout | undefined;
    const append = (current: string, chunk: Buffer): string => {
      const remaining = Math.max(0, options.maxOutputBytes - bytes);
      bytes += chunk.byteLength;
      if (chunk.byteLength > remaining || bytes > options.maxOutputBytes) truncated = true;
      return remaining === 0 ? current : current + chunk.subarray(0, remaining).toString("utf8");
    };
    child.stdout?.on("data", (chunk: Buffer) => {
      stdout = append(stdout, chunk);
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr = append(stderr, chunk);
    });
    child.once("error", (error) => {
      if (settled) return;
      settled = true;
      if (timeoutTimer !== undefined) clearTimeout(timeoutTimer);
      if (escalationTimer !== undefined) clearTimeout(escalationTimer);
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
      if (timeoutTimer !== undefined) clearTimeout(timeoutTimer);
      if (escalationTimer !== undefined) clearTimeout(escalationTimer);
      resolve({
        exitCode: code ?? (signal === null ? 1 : 128),
        signal,
        stdout,
        stderr,
        timedOut,
        truncated,
      });
    });
    timeoutTimer = setTimeout(() => {
      timedOut = true;
      terminateProcessTree(child, "SIGTERM");
      escalationTimer = setTimeout(() => terminateProcessTree(child, "SIGKILL", true), 1_000);
      escalationTimer.unref?.();
    }, options.timeoutMs);
    timeoutTimer.unref?.();
  });
}
