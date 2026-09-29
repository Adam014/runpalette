import { relative } from "node:path";
import { commandMatchesWorkspace } from "./catalog.js";
import { RunpaletteError } from "./errors.js";
import type { CatalogCommand, CommandCatalog, ExecutionPlan } from "./model.js";
import { evaluateRequirements } from "./requirements.js";

function distance(left: string, right: string): number {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      current[rightIndex] = Math.min(
        (current[rightIndex - 1] ?? 0) + 1,
        (previous[rightIndex] ?? 0) + 1,
        (previous[rightIndex - 1] ?? 0) + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      );
    }
    previous.splice(0, previous.length, ...current);
  }
  return previous[right.length] ?? Math.max(left.length, right.length);
}

function suggestions(catalog: CommandCatalog, requested: string): string[] {
  return [...new Set(catalog.commands.flatMap((command) => [command.name, ...command.aliases]))]
    .map((name) => ({ name, score: distance(requested.toLowerCase(), name.toLowerCase()) }))
    .sort((left, right) => left.score - right.score || left.name.localeCompare(right.name))
    .slice(0, 3)
    .map(({ name }) => name);
}

function selectCommand(
  catalog: CommandCatalog,
  requested: string,
  workspace?: string,
  source?: string,
): CatalogCommand {
  const matches = catalog.commands.filter(
    (candidate) =>
      (candidate.name === requested || candidate.aliases.includes(requested)) &&
      (workspace === undefined || commandMatchesWorkspace(candidate, workspace)) &&
      (source === undefined || candidate.source.kind === source),
  );
  if (matches.length === 1 && matches[0] !== undefined) return matches[0];
  if (matches.length > 1) {
    throw new RunpaletteError(
      "COMMAND_AMBIGUOUS",
      `Command ${JSON.stringify(requested)} exists in multiple workspaces or sources and is ambiguous.`,
      `Choose a source with --source or a workspace with --workspace: ${matches
        .map((command) => `${command.source.kind}:${command.workspace.name}`)
        .join(", ")}.`,
    );
  }
  const nearest = suggestions(catalog, requested);
  throw new RunpaletteError(
    "COMMAND_NOT_FOUND",
    `Command or alias ${JSON.stringify(requested)} was not found${workspace === undefined ? "" : ` in workspace ${workspace}`}${source === undefined ? "" : ` from ${source}`}.`,
    nearest.length === 0
      ? "Run `runpalette list` to inspect available commands."
      : `Closest commands: ${nearest.join(", ")}. Run \`runpalette list\` for the complete catalog.`,
  );
}

export function createExecutionPlan(
  catalog: CommandCatalog,
  scriptName: string,
  scriptArgs: readonly string[],
  workspace?: string,
  source?: string,
): ExecutionPlan {
  const command = selectCommand(catalog, scriptName, workspace, source);
  const separator = command.execution.forwardedArgsSeparator;
  return {
    schemaVersion: 1,
    command: "run",
    script: { name: command.name, value: command.script, requestedAs: scriptName },
    workspace: command.workspace,
    safety: command.safety,
    requirements: command.requirements,
    readiness: evaluateRequirements(command.requirements),
    source: command.source,
    ...(catalog.packageManager === undefined
      ? {}
      : { packageManager: catalog.packageManager.name }),
    executable: command.execution.executable,
    args: [
      ...command.execution.args,
      ...(scriptArgs.length === 0
        ? []
        : [...(separator === undefined ? [] : [separator]), ...scriptArgs]),
    ],
    cwd: command.workspace.root,
  };
}

export function planForOutput(plan: ExecutionPlan, invocationCwd: string): ExecutionPlan {
  return {
    ...plan,
    cwd: relative(invocationCwd, plan.cwd) || ".",
    workspace: {
      ...plan.workspace,
      root: relative(invocationCwd, plan.workspace.root) || ".",
    },
    source: {
      ...plan.source,
      path: relative(invocationCwd, plan.source.path) || ".",
    },
  };
}
