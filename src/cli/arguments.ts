import { RunpaletteError } from "../core/errors.js";
import type { PackageManagerName } from "../core/model.js";
import { PACKAGE_MANAGERS } from "../core/model.js";

export type Preference = "auto" | "always" | "never";
export type CliCommand = "home" | "list" | "run" | "help" | "version";

export interface CliArguments {
  command: CliCommand;
  cwd: string;
  packageManager?: PackageManagerName;
  json: boolean;
  nonInteractive: boolean;
  dryRun: boolean;
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
    if (!commandSeen && (argument === "list" || argument === "run")) {
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

  return result;
}
