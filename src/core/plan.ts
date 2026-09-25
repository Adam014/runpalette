import { commandMatchesWorkspace } from "./catalog.js";
import { RunpaletteError } from "./errors.js";
import type { CatalogCommand, CommandCatalog, ExecutionPlan, PackageManagerName } from "./model.js";

function managerArguments(
  packageManager: PackageManagerName,
  scriptName: string,
  scriptArgs: readonly string[],
): string[] {
  if (packageManager === "npm") {
    return ["run", scriptName, ...(scriptArgs.length === 0 ? [] : ["--", ...scriptArgs])];
  }
  return ["run", scriptName, ...scriptArgs];
}

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
): CatalogCommand {
  const matches = catalog.commands.filter(
    (candidate) =>
      (candidate.name === requested || candidate.aliases.includes(requested)) &&
      (workspace === undefined || commandMatchesWorkspace(candidate, workspace)),
  );
  if (matches.length === 1 && matches[0] !== undefined) return matches[0];
  if (matches.length > 1) {
    throw new RunpaletteError(
      "COMMAND_AMBIGUOUS",
      `Command ${JSON.stringify(requested)} exists in multiple workspaces.`,
      `Choose one with --workspace: ${matches.map((command) => command.workspace.name).join(", ")}.`,
    );
  }
  const nearest = suggestions(catalog, requested);
  throw new RunpaletteError(
    "COMMAND_NOT_FOUND",
    `Script or alias ${JSON.stringify(requested)} was not found${workspace === undefined ? "" : ` in workspace ${workspace}`}.`,
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
): ExecutionPlan {
  const command = selectCommand(catalog, scriptName, workspace);
  return {
    schemaVersion: 1,
    command: "run",
    script: { name: command.name, value: command.script, requestedAs: scriptName },
    workspace: command.workspace,
    safety: command.safety,
    packageManager: catalog.packageManager.name,
    executable: catalog.packageManager.name,
    args: managerArguments(catalog.packageManager.name, command.name, scriptArgs),
    cwd: command.workspace.root,
  };
}
