import type { ChildProcess } from "node:child_process";
import process from "node:process";
import spawn from "cross-spawn";

export function terminateProcessTree(
  child: ChildProcess,
  signal: NodeJS.Signals,
  force = false,
): void {
  if (child.pid === undefined) {
    child.kill(signal);
    return;
  }

  if (process.platform === "win32") {
    const killer = spawn("taskkill", ["/pid", String(child.pid), "/T", ...(force ? ["/F"] : [])], {
      stdio: "ignore",
      windowsHide: true,
    });
    killer.once("error", () => child.kill(signal));
    killer.unref();
    return;
  }

  try {
    process.kill(-child.pid, signal);
  } catch {
    child.kill(signal);
  }
}
