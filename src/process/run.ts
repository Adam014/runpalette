import { spawn } from "node:child_process";
import { constants } from "node:os";
import { RunpaletteError } from "../core/errors.js";
import type { ExecutionPlan } from "../core/model.js";

export async function executePlan(plan: ExecutionPlan): Promise<number> {
  return await new Promise<number>((resolve, reject) => {
    const child = spawn(plan.executable, plan.args, {
      cwd: plan.cwd,
      env: process.env,
      shell: false,
      stdio: "inherit",
    });
    child.once("error", (error) => {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        reject(
          new RunpaletteError(
            "PACKAGE_MANAGER_NOT_FOUND",
            `Cannot find the ${plan.packageManager} executable.`,
            `Install ${plan.packageManager} or select another manager with --package-manager.`,
          ),
        );
        return;
      }
      reject(error);
    });
    child.once("exit", (code, signal) => {
      if (code !== null) {
        resolve(code);
        return;
      }
      const signalNumber = signal === null ? undefined : constants.signals[signal];
      resolve(signalNumber === undefined ? 1 : 128 + signalNumber);
    });
  });
}
