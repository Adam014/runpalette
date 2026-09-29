import process from "node:process";
import { executableAvailable } from "../process/executable.js";
import { RunpaletteError } from "./errors.js";
import type { CommandReadiness, CommandRequirements, ExecutionPlan } from "./model.js";

export function evaluateRequirements(
  requirements: CommandRequirements,
  environment: NodeJS.ProcessEnv = process.env,
  available: (executable: string) => boolean = executableAvailable,
): CommandReadiness {
  const missingEnvironment = requirements.environment.filter(
    (name) => environment[name] === undefined,
  );
  const missingExecutables = requirements.executables.filter(
    (executable) => !available(executable),
  );
  return {
    ready: missingEnvironment.length === 0 && missingExecutables.length === 0,
    missingEnvironment,
    missingExecutables,
  };
}

export function assertPlanReady(plan: ExecutionPlan): void {
  if (plan.readiness.ready) return;
  const missing = [
    ...(plan.readiness.missingEnvironment.length === 0
      ? []
      : [`environment: ${plan.readiness.missingEnvironment.join(", ")}`]),
    ...(plan.readiness.missingExecutables.length === 0
      ? []
      : [`executables: ${plan.readiness.missingExecutables.join(", ")}`]),
  ];
  throw new RunpaletteError(
    "COMMAND_REQUIREMENTS_UNMET",
    `Command ${JSON.stringify(plan.script.name)} is not ready (${missing.join("; ")}).`,
    "Provide the declared requirements, then review the command again with --dry-run.",
  );
}
