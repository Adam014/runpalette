import { readFile, stat, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import { RunpaletteError } from "./errors.js";
import type { CommandCatalog } from "./model.js";

export interface GroupConfig {
  label?: string;
  order?: number;
}

export interface CommandConfig {
  label?: string;
  description?: string;
  group?: string;
  order?: number;
  hidden?: boolean;
  aliases?: string[];
  confirm?: boolean | string;
  requires?: {
    environment?: string[];
    executables?: string[];
  };
}

export interface RunpaletteConfig {
  schemaVersion: 1;
  path?: string;
  default?: string;
  groups: Record<string, GroupConfig>;
  commands: Record<string, CommandConfig>;
}

const EMPTY_CONFIG: RunpaletteConfig = {
  schemaVersion: 1,
  groups: {},
  commands: {},
};

export interface ConfigValidationReport {
  schemaVersion: 1;
  status: "valid" | "warning";
  path: string;
  configured: { commands: number; groups: number; default: boolean };
  discovered: { runnableCommands: number; workspaces: number };
  unmatchedSelectors: string[];
}

function invalid(path: string, message: string): never {
  throw new RunpaletteError(
    "CONFIG_INVALID",
    `${path}: ${message}`,
    "Fix runpalette.json or remove it to use zero-config discovery.",
  );
}

function object(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    invalid(path, "expected an object");
  }
  return value as Record<string, unknown>;
}

function knownKeys(
  record: Record<string, unknown>,
  allowed: readonly string[],
  path: string,
): void {
  const unknown = Object.keys(record).filter((key) => !allowed.includes(key));
  if (unknown.length > 0) invalid(path, `unknown field ${JSON.stringify(unknown[0])}`);
}

function optionalString(value: unknown, path: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.trim() === "")
    invalid(path, "expected a non-empty string");
  return value.trim();
}

function optionalOrder(value: unknown, path: string): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value))
    invalid(path, "expected a finite number");
  return value;
}

function parseGroup(value: unknown, path: string): GroupConfig {
  const record = object(value, path);
  knownKeys(record, ["label", "order"], path);
  const label = optionalString(record.label, `${path}.label`);
  const order = optionalOrder(record.order, `${path}.order`);
  return { ...(label === undefined ? {} : { label }), ...(order === undefined ? {} : { order }) };
}

function parseCommand(value: unknown, path: string): CommandConfig {
  const record = object(value, path);
  knownKeys(
    record,
    ["label", "description", "group", "order", "hidden", "aliases", "confirm", "requires"],
    path,
  );
  const label = optionalString(record.label, `${path}.label`);
  const description = optionalString(record.description, `${path}.description`);
  const group = optionalString(record.group, `${path}.group`);
  const order = optionalOrder(record.order, `${path}.order`);
  if (record.hidden !== undefined && typeof record.hidden !== "boolean") {
    invalid(`${path}.hidden`, "expected a boolean");
  }
  let aliases: string[] | undefined;
  if (record.aliases !== undefined) {
    if (!Array.isArray(record.aliases)) invalid(`${path}.aliases`, "expected an array");
    aliases = record.aliases.map((alias, index) => {
      const parsed = optionalString(alias, `${path}.aliases[${String(index)}]`);
      if (parsed === undefined) invalid(`${path}.aliases[${String(index)}]`, "expected a string");
      return parsed;
    });
    if (new Set(aliases).size !== aliases.length) invalid(`${path}.aliases`, "contains duplicates");
  }
  if (
    record.confirm !== undefined &&
    typeof record.confirm !== "boolean" &&
    (typeof record.confirm !== "string" || record.confirm.trim() === "")
  ) {
    invalid(`${path}.confirm`, "expected a boolean or non-empty string");
  }
  let requires: CommandConfig["requires"];
  if (record.requires !== undefined) {
    const requirementRecord = object(record.requires, `${path}.requires`);
    knownKeys(requirementRecord, ["environment", "executables"], `${path}.requires`);
    const parseRequirementList = (key: "environment" | "executables"): string[] | undefined => {
      const input = requirementRecord[key];
      if (input === undefined) return undefined;
      if (!Array.isArray(input)) invalid(`${path}.requires.${key}`, "expected an array");
      const values = input.map((entry, index) => {
        const parsed = optionalString(entry, `${path}.requires.${key}[${String(index)}]`);
        if (parsed === undefined)
          invalid(`${path}.requires.${key}[${String(index)}]`, "expected a string");
        if (parsed.includes("\0"))
          invalid(`${path}.requires.${key}[${String(index)}]`, "cannot contain a null byte");
        if (key === "environment" && parsed.includes("="))
          invalid(
            `${path}.requires.${key}[${String(index)}]`,
            "must be a variable name, not an assignment",
          );
        return parsed;
      });
      if (new Set(values).size !== values.length)
        invalid(`${path}.requires.${key}`, "contains duplicates");
      return values;
    };
    const environment = parseRequirementList("environment");
    const executables = parseRequirementList("executables");
    requires = {
      ...(environment === undefined ? {} : { environment }),
      ...(executables === undefined ? {} : { executables }),
    };
  }
  return {
    ...(label === undefined ? {} : { label }),
    ...(description === undefined ? {} : { description }),
    ...(group === undefined ? {} : { group }),
    ...(order === undefined ? {} : { order }),
    ...(record.hidden === undefined ? {} : { hidden: record.hidden as boolean }),
    ...(aliases === undefined ? {} : { aliases }),
    ...(record.confirm === undefined
      ? {}
      : {
          confirm: typeof record.confirm === "string" ? record.confirm.trim() : record.confirm,
        }),
    ...(requires === undefined ? {} : { requires }),
  };
}

export function parseConfig(value: unknown, path = "runpalette.json"): RunpaletteConfig {
  const record = object(value, path);
  knownKeys(record, ["$schema", "schemaVersion", "default", "groups", "commands"], path);
  if (record.schemaVersion !== 1) invalid(`${path}.schemaVersion`, "expected 1");
  const defaultCommand = optionalString(record.default, `${path}.default`);
  const groupsRecord = record.groups === undefined ? {} : object(record.groups, `${path}.groups`);
  const commandsRecord =
    record.commands === undefined ? {} : object(record.commands, `${path}.commands`);
  const groups = Object.fromEntries(
    Object.entries(groupsRecord).map(([id, group]) => {
      if (!/^[a-z0-9][a-z0-9._-]*$/u.test(id)) {
        invalid(`${path}.groups`, `invalid group id ${JSON.stringify(id)}`);
      }
      return [id, parseGroup(group, `${path}.groups.${id}`)];
    }),
  );
  const commands = Object.fromEntries(
    Object.entries(commandsRecord).map(([selector, command]) => {
      if (selector.trim() === "") invalid(`${path}.commands`, "command selectors cannot be empty");
      return [selector, parseCommand(command, `${path}.commands.${selector}`)];
    }),
  );
  return {
    schemaVersion: 1,
    ...(defaultCommand === undefined ? {} : { default: defaultCommand }),
    groups,
    commands,
  };
}

async function isFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

export function resolveConfigPath(root: string, path?: string): string {
  if (path === undefined) return join(root, "runpalette.json");
  return isAbsolute(path) ? path : resolve(process.cwd(), path);
}

export function configTemplate(version: string): string {
  return `${JSON.stringify(
    {
      $schema: `https://unpkg.com/runpalette@${version}/schema/runpalette.schema.json`,
      schemaVersion: 1,
      groups: {},
      commands: {},
    },
    null,
    2,
  )}\n`;
}

export async function initializeConfig(options: {
  root: string;
  version: string;
  path?: string;
  force?: boolean;
}): Promise<{ path: string; overwritten: boolean }> {
  const path = resolveConfigPath(options.root, options.path);
  const existed = await isFile(path);
  try {
    await writeFile(path, configTemplate(options.version), {
      encoding: "utf8",
      flag: options.force === true ? "w" : "wx",
    });
  } catch (error) {
    if (
      options.force !== true &&
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "EEXIST"
    ) {
      throw new RunpaletteError(
        "CONFIG_EXISTS",
        `Configuration file already exists: ${path}`,
        "Validate it with `runpalette config validate`, or replace it explicitly with `runpalette config init --force`.",
      );
    }
    const detail = error instanceof Error ? error.message : "Unknown write error";
    throw new RunpaletteError(
      "CONFIG_WRITE_FAILED",
      `Cannot write ${path}: ${detail}`,
      "Check the parent directory and file permissions, then try again.",
    );
  }
  return { path, overwritten: options.force === true && existed };
}

export function createConfigValidationReport(
  config: RunpaletteConfig,
  catalog: CommandCatalog,
  invocationCwd: string,
  availableSelectors: ReadonlySet<string>,
): ConfigValidationReport {
  if (config.path === undefined) {
    throw new RunpaletteError(
      "CONFIG_READ_FAILED",
      "No Runpalette configuration file was found.",
      "Create one with `runpalette config init`.",
    );
  }
  const unmatchedSelectors = Object.keys(config.commands).filter(
    (selector) => !availableSelectors.has(selector),
  );
  return {
    schemaVersion: 1,
    status: unmatchedSelectors.length === 0 ? "valid" : "warning",
    path: relative(invocationCwd, config.path) || ".",
    configured: {
      commands: Object.keys(config.commands).length,
      groups: Object.keys(config.groups).length,
      default: config.default !== undefined,
    },
    discovered: {
      runnableCommands: catalog.commands.length,
      workspaces: catalog.project.workspaceCount,
    },
    unmatchedSelectors,
  };
}

export async function loadConfig(options: {
  root: string;
  path?: string;
}): Promise<RunpaletteConfig> {
  const path = resolveConfigPath(options.root, options.path);
  if (!(await isFile(path))) {
    if (options.path !== undefined) {
      throw new RunpaletteError(
        "CONFIG_READ_FAILED",
        `Configuration file does not exist: ${path}`,
        "Choose an existing JSON file with --config.",
      );
    }
    return { ...EMPTY_CONFIG, groups: {}, commands: {} };
  }
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown read error";
    throw new RunpaletteError("CONFIG_READ_FAILED", `Cannot read ${path}: ${detail}`);
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Invalid JSON";
    invalid(path, detail);
  }
  return { ...parseConfig(value, path), path };
}

export function commandConfig(
  config: RunpaletteConfig,
  workspaceName: string,
  workspacePath: string,
  scriptName: string,
): CommandConfig {
  const general = config.commands[scriptName] ?? {};
  const specific =
    config.commands[`${workspaceName}#${scriptName}`] ??
    config.commands[`${workspacePath}#${scriptName}`] ??
    {};
  const merged = { ...general, ...specific };
  if (general.requires !== undefined || specific.requires !== undefined) {
    merged.requires = { ...general.requires, ...specific.requires };
  }
  return merged;
}
