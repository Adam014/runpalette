import { RunpaletteError } from "../core/errors.js";
import type { CommandSourceKind, PackageManagerName } from "../core/model.js";
import { COMMAND_SOURCES, PACKAGE_MANAGERS } from "../core/model.js";

export type Preference = "auto" | "always" | "never";
export type CliCommand = "home" | "list" | "run" | "mcp" | "help" | "version";

export interface CliArguments {
  command: CliCommand;
  cwd: string;
  packageManager?: PackageManagerName;
  workspace?: string;
  group?: string;
  source?: CommandSourceKind;
  config?: string;
  json: boolean;
  nonInteractive: boolean;
  dryRun: boolean;
  yes: boolean;
  allowExecution: boolean;
  color: Preference;
  unicode: Preference;
  scriptName?: string;
  scriptArgs: string[];
}

function valueAfter(args: readonly string[], index: number, flag: string): string {
  const value = args[index + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new RunpaletteError("ARGUMENT_INVALID", `Missing value for ${flag}.`);
  }
  return value;
}

function preference(value: string, flag: string): Preference {
  if (value === "auto" || value === "always" || value === "never") return value;
  throw new RunpaletteError(
    "ARGUMENT_INVALID",
    `Invalid value for ${flag}: ${value}`,
    "Use auto, always, or never.",
  );
}

export function parseArguments(args: readonly string[], processCwd: string): CliArguments {
  const result: CliArguments = {
    command: "home",
    cwd: processCwd,
    json: false,
    nonInteractive: false,
    dryRun: false,
    yes: false,
    allowExecution: false,
    color: "auto",
    unicode: "auto",
    scriptArgs: [],
  };
  let commandSeen = false;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === undefined) continue;

    if (argument === "--") {
      if (result.command !== "run" || result.scriptName === undefined) {
        throw new RunpaletteError(
          "ARGUMENT_INVALID",
          "Script arguments require `run NAME -- ARGS...`.",
        );
      }
      result.scriptArgs.push(...args.slice(index + 1));
      break;
    }
    if (argument === "--json") {
      result.json = true;
      result.nonInteractive = true;
      continue;
    }
    if (argument === "--non-interactive") {
      result.nonInteractive = true;
      continue;
    }
    if (argument === "--dry-run") {
      result.dryRun = true;
      continue;
    }
    if (argument === "--yes" || argument === "-y") {
      result.yes = true;
      continue;
    }
    if (argument === "--allow-execution") {
      result.allowExecution = true;
      continue;
    }
    if (argument === "--no-color") {
      result.color = "never";
      continue;
    }
    if (argument === "--no-unicode") {
      result.unicode = "never";
      continue;
    }
    if (argument.startsWith("--cwd=")) {
      result.cwd = argument.slice("--cwd=".length);
      continue;
    }
    if (argument === "--cwd") {
      result.cwd = valueAfter(args, index, argument);
      index += 1;
      continue;
    }
    if (argument.startsWith("--workspace=")) {
      result.workspace = argument.slice("--workspace=".length);
      if (result.workspace === "")
        throw new RunpaletteError("ARGUMENT_INVALID", "Missing value for --workspace.");
      continue;
    }
    if (argument === "--workspace") {
      result.workspace = valueAfter(args, index, argument);
      index += 1;
      continue;
    }
    if (argument.startsWith("--group=")) {
      result.group = argument.slice("--group=".length);
      if (result.group === "")
        throw new RunpaletteError("ARGUMENT_INVALID", "Missing value for --group.");
      continue;
    }
    if (argument === "--group") {
      result.group = valueAfter(args, index, argument);
      index += 1;
      continue;
    }
    if (argument.startsWith("--source=")) {
      const source = argument.slice("--source=".length);
      if (!COMMAND_SOURCES.includes(source as CommandSourceKind)) {
        throw new RunpaletteError(
          "ARGUMENT_INVALID",
          `Unsupported command source: ${source}`,
          `Use one of: ${COMMAND_SOURCES.join(", ")}.`,
        );
      }
      result.source = source as CommandSourceKind;
      continue;
    }
    if (argument === "--source") {
      const source = valueAfter(args, index, argument);
      if (!COMMAND_SOURCES.includes(source as CommandSourceKind)) {
        throw new RunpaletteError(
          "ARGUMENT_INVALID",
          `Unsupported command source: ${source}`,
          `Use one of: ${COMMAND_SOURCES.join(", ")}.`,
        );
      }
      result.source = source as CommandSourceKind;
      index += 1;
      continue;
    }
    if (argument.startsWith("--config=")) {
      result.config = argument.slice("--config=".length);
      if (result.config === "")
        throw new RunpaletteError("ARGUMENT_INVALID", "Missing value for --config.");
      continue;
    }
    if (argument === "--config") {
      result.config = valueAfter(args, index, argument);
      index += 1;
      continue;
    }
    if (argument.startsWith("--package-manager=")) {
      const manager = argument.slice("--package-manager=".length);
      if (!PACKAGE_MANAGERS.includes(manager as PackageManagerName)) {
        throw new RunpaletteError(
          "PACKAGE_MANAGER_INVALID",
          `Unsupported package manager: ${manager}`,
          `Use one of: ${PACKAGE_MANAGERS.join(", ")}.`,
        );
      }
      result.packageManager = manager as PackageManagerName;
      continue;
    }
    if (argument === "--package-manager") {
      const manager = valueAfter(args, index, argument);
      if (!PACKAGE_MANAGERS.includes(manager as PackageManagerName)) {
        throw new RunpaletteError(
          "PACKAGE_MANAGER_INVALID",
          `Unsupported package manager: ${manager}`,
          `Use one of: ${PACKAGE_MANAGERS.join(", ")}.`,
        );
      }
      result.packageManager = manager as PackageManagerName;
      index += 1;
      continue;
    }
    if (argument.startsWith("--color=")) {
      result.color = preference(argument.slice("--color=".length), "--color");
      continue;
    }
    if (argument.startsWith("--unicode=")) {
      result.unicode = preference(argument.slice("--unicode=".length), "--unicode");
      continue;
    }
    if (argument === "--help" || argument === "-h") {
      result.command = "help";
      commandSeen = true;
      continue;
    }
    if (argument === "--version" || argument === "-V") {
      result.command = "version";
      commandSeen = true;
      continue;
    }
    if (argument.startsWith("-")) {
      throw new RunpaletteError("ARGUMENT_INVALID", `Unknown option: ${argument}`);
    }
    if (!commandSeen && (argument === "list" || argument === "run" || argument === "mcp")) {
      result.command = argument;
      commandSeen = true;
      continue;
    }
    if (result.command === "run" && result.scriptName === undefined) {
      result.scriptName = argument;
      continue;
    }
    throw new RunpaletteError("ARGUMENT_INVALID", `Unexpected argument: ${argument}`);
  }

  if (result.command === "run" && result.scriptName === undefined) {
    throw new RunpaletteError(
      "ARGUMENT_INVALID",
      "Missing script name for `runpalette run`.",
      "Use `runpalette list` to see available scripts.",
    );
  }
  if (result.allowExecution && result.command !== "mcp") {
    throw new RunpaletteError(
      "ARGUMENT_INVALID",
      "--allow-execution is only valid with `runpalette mcp`.",
    );
  }
  if (
    result.command === "mcp" &&
    (result.workspace !== undefined || result.group !== undefined || result.source !== undefined)
  ) {
    throw new RunpaletteError(
      "ARGUMENT_INVALID",
      "Workspace, group, and source filters are MCP tool inputs, not server options.",
      "Start `runpalette mcp`, then pass filters to list_commands or selectors to plan_command and run_command.",
    );
  }
  if (result.command === "mcp" && (result.json || result.dryRun || result.yes)) {
    throw new RunpaletteError(
      "ARGUMENT_INVALID",
      "--json, --dry-run, and --yes cannot be used with the MCP stdio server.",
      "Use the MCP tools for structured plans and explicit execution confirmation.",
    );
  }

  return result;
}
