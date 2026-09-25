import { RunpaletteError } from "./errors.js";
import type { CommandCatalog, ExecutionPlan, PackageManagerName } from "./model.js";

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

export function createExecutionPlan(
  catalog: CommandCatalog,
  scriptName: string,
  scriptArgs: readonly string[],
): ExecutionPlan {
  const command = catalog.commands.find((candidate) => candidate.name === scriptName);
  if (command === undefined) {
    throw new RunpaletteError(
      "COMMAND_NOT_FOUND",
      `Script ${JSON.stringify(scriptName)} was not found in ${catalog.project.name}.`,
      catalog.commands.length === 0
        ? "Add a script to package.json."
        : `Available scripts: ${catalog.commands.map((candidate) => candidate.name).join(", ")}.`,
    );
  }

  return {
    schemaVersion: 1,
    command: "run",
    script: { name: command.name, value: command.script },
    packageManager: catalog.packageManager.name,
    executable: catalog.packageManager.name,
    args: managerArguments(catalog.packageManager.name, command.name, scriptArgs),
    cwd: catalog.project.root,
  };
}
