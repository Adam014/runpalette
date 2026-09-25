import { createInterface } from "node:readline/promises";
import type { Readable, Writable } from "node:stream";
import type { ExecutionPlan } from "../core/model.js";

export function affirmative(value: string): boolean {
  return /^(?:y|yes)$/iu.test(value.trim());
}

export async function confirmExecution(
  plan: ExecutionPlan,
  streams: { input?: Readable; output?: Writable } = {},
): Promise<boolean> {
  const message = plan.safety.message ?? "This command is configured to require confirmation.";
  const terminal = createInterface({
    input: streams.input ?? process.stdin,
    output: streams.output ?? process.stderr,
  });
  try {
    const answer = await terminal.question(
      `\n${message}\nRun ${plan.workspace.name} · ${plan.script.name}? [y/N] `,
    );
    return affirmative(answer);
  } finally {
    terminal.close();
  }
}
