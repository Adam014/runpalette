import { relative } from "node:path";
import { commandConfig, type RunpaletteConfig } from "./config.js";
import { RunpaletteError } from "./errors.js";
import type {
  CatalogCommand,
  CommandCatalog,
  CommandGroupId,
  HiddenCommand,
  ProjectContext,
  ProjectWorkspace,
} from "./model.js";
import { COMMAND_GROUPS } from "./model.js";

const GROUP_PATTERNS: ReadonlyArray<{
  id: Exclude<(typeof COMMAND_GROUPS)[number]["id"], "other">;
  terms: readonly string[];
}> = [
  {
    id: "develop",
    terms: ["dev", "start", "serve", "watch", "preview", "storybook", "android", "ios"],
  },
  {
    id: "quality",
    terms: [
      "test",
      "spec",
      "unit",
      "integration",
      "e2e",
      "lint",
      "format",
      "check",
      "typecheck",
      "coverage",
      "audit",
      "verify",
    ],
  },
  {
    id: "build",
    terms: ["build", "compile", "bundle", "pack", "publish", "release", "deploy", "clean"],
  },
  {
    id: "operations",
    terms: [
      "db",
      "database",
      "migrate",
      "migration",
      "seed",
      "generate",
      "codegen",
      "docker",
      "infra",
      "setup",
      "install",
      "sync",
    ],
  },
];

const AUTOMATIC_LIFECYCLE_SCRIPTS = new Set([
  "dependencies",
  "install",
  "postinstall",
  "postpack",
  "postprepare",
  "preinstall",
  "prepack",
  "prepare",
  "preprepare",
  "prepublish",
  "prepublishOnly",
]);

function tokens(name: string): string[] {
  return name
    .replace(/([a-z\d])([A-Z])/gu, "$1 $2")
    .toLowerCase()
    .split(/[:/_.\-\s]+/u)
    .filter(Boolean);
}

export function classifyCommand(name: string): CommandGroupId {
  const commandTokens = tokens(name);
  const primaryToken = commandTokens[0];
  if (primaryToken !== undefined) {
    for (const group of GROUP_PATTERNS) {
      if (group.terms.includes(primaryToken)) return group.id;
    }
  }
  for (const group of GROUP_PATTERNS) {
    if (group.terms.some((term) => commandTokens.includes(term))) return group.id;
  }
  return "other";
}

function isLifecycleScript(name: string, allNames: ReadonlySet<string>): boolean {
  if (AUTOMATIC_LIFECYCLE_SCRIPTS.has(name)) return true;
  if (name.startsWith("pre") && name.length > 3) return allNames.has(name.slice(3));
  if (name.startsWith("post") && name.length > 4) return allNames.has(name.slice(4));
  return false;
}

function isSelfAlias(name: string, script: string): boolean {
  if (name !== "what" && name !== "runpalette") return false;
  return /(^|\s|\/)(?:runpalette)(?:\s|$)/u.test(script);
}

function title(value: string): string {
  return value
    .split(/[._-]+/u)
    .filter(Boolean)
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join(" ");
}

function rootWorkspace(project: ProjectContext): ProjectWorkspace {
  return {
    name: project.name,
    root: project.root,
    manifestPath: project.manifestPath,
    relativePath: ".",
    manifest: project.manifest,
  };
}

function matchesWorkspace(command: CatalogCommand, selector: string): boolean {
  return (
    (selector === "root" && command.workspace.isRoot) ||
    command.workspace.name === selector ||
    command.workspace.path === selector
  );
}

function resolveDefault(commands: readonly CatalogCommand[], selector: string): string {
  const hash = selector.lastIndexOf("#");
  const workspace = hash === -1 ? undefined : selector.slice(0, hash);
  const requested = hash === -1 ? selector : selector.slice(hash + 1);
  const matches = commands.filter(
    (command) =>
      (workspace === undefined || matchesWorkspace(command, workspace)) &&
      (command.name === requested || command.aliases.includes(requested)),
  );
  if (matches.length === 1 && matches[0] !== undefined) return matches[0].id;
  if (matches.length === 0) {
    throw new RunpaletteError(
      "CONFIG_INVALID",
      `Default command ${JSON.stringify(selector)} does not match a visible command.`,
      "Use a script name, alias, or workspace#script selector from `runpalette list`.",
    );
  }
  throw new RunpaletteError(
    "CONFIG_INVALID",
    `Default command ${JSON.stringify(selector)} is ambiguous across workspaces.`,
    "Qualify it as workspace#script.",
  );
}

export function createCatalog(
  project: ProjectContext,
  config: RunpaletteConfig = { schemaVersion: 1, groups: {}, commands: {} },
): CommandCatalog {
  const packages = [rootWorkspace(project), ...project.workspaces];
  const commands: CatalogCommand[] = [];
  const hidden: HiddenCommand[] = [];
  let manifestOrder = 0;

  for (const workspace of packages) {
    const scripts = workspace.manifest.scripts ?? {};
    const allNames = new Set(Object.keys(scripts));
    for (const [name, script] of Object.entries(scripts)) {
      const configured = commandConfig(config, workspace.name, workspace.relativePath, name);
      if (isLifecycleScript(name, allNames)) {
        hidden.push({ name, workspace: workspace.relativePath, reason: "lifecycle" });
        continue;
      }
      if (isSelfAlias(name, script)) {
        hidden.push({ name, workspace: workspace.relativePath, reason: "self" });
        continue;
      }
      if (configured.hidden === true) {
        hidden.push({ name, workspace: workspace.relativePath, reason: "config" });
        continue;
      }
      const confirm = configured.confirm;
      commands.push({
        id: `package:${workspace.relativePath}:${name}`,
        name,
        label: configured.label ?? name,
        ...(configured.description === undefined ? {} : { description: configured.description }),
        aliases: configured.aliases ?? [],
        script,
        group: configured.group ?? classifyCommand(name),
        order: configured.order ?? manifestOrder,
        safety: {
          confirmationRequired: confirm === true || typeof confirm === "string",
          ...(typeof confirm === "string" ? { message: confirm } : {}),
        },
        workspace: {
          name: workspace.name,
          path: workspace.relativePath,
          root: workspace.root,
          isRoot: workspace.relativePath === ".",
        },
        source: { kind: "package.json", path: workspace.manifestPath },
      });
      manifestOrder += 1;
    }
  }

  for (const workspace of packages) {
    const local = commands.filter((command) => command.workspace.path === workspace.relativePath);
    const selectors = new Map<string, string>();
    for (const command of local) {
      for (const selector of [command.name, ...command.aliases]) {
        const existing = selectors.get(selector);
        if (existing !== undefined) {
          throw new RunpaletteError(
            "CONFIG_INVALID",
            `Command selector ${JSON.stringify(selector)} is shared by ${existing} and ${command.name} in ${workspace.name}.`,
            "Use unique aliases within each workspace.",
          );
        }
        selectors.set(selector, command.name);
      }
    }
  }

  const groupDefinitions = new Map<string, { label: string; order: number }>();
  COMMAND_GROUPS.forEach((group, index) => {
    const configured = config.groups[group.id];
    groupDefinitions.set(group.id, {
      label: configured?.label ?? group.label,
      order: configured?.order ?? index * 100,
    });
  });
  for (const [id, configured] of Object.entries(config.groups)) {
    if (!groupDefinitions.has(id)) {
      groupDefinitions.set(id, {
        label: configured.label ?? title(id),
        order: configured.order ?? 1_000,
      });
    }
  }
  for (const command of commands) {
    if (!groupDefinitions.has(command.group)) {
      groupDefinitions.set(command.group, { label: title(command.group), order: 1_000 });
    }
  }

  const groups = [...groupDefinitions.entries()]
    .sort((left, right) => left[1].order - right[1].order || left[0].localeCompare(right[0]))
    .map(([id, definition]) => ({
      id,
      label: definition.label,
      commands: commands
        .filter((command) => command.group === id)
        .sort((left, right) => left.order - right.order || left.label.localeCompare(right.label)),
    }))
    .filter((group) => group.commands.length > 0);

  const catalog: CommandCatalog = {
    schemaVersion: 1,
    project: {
      name: project.name,
      root: project.root,
      manifestPath: project.manifestPath,
      workspaceCount: project.workspaces.length,
    },
    packageManager: project.packageManager,
    groups,
    commands,
    hidden,
  };
  return config.default === undefined
    ? catalog
    : { ...catalog, defaultCommandId: resolveDefault(commands, config.default) };
}

export function filterCatalog(
  catalog: CommandCatalog,
  options: { group?: string; workspace?: string },
): CommandCatalog {
  if (options.group !== undefined && !catalog.groups.some((group) => group.id === options.group)) {
    throw new RunpaletteError(
      "GROUP_NOT_FOUND",
      `Command group ${JSON.stringify(options.group)} was not found.`,
      `Available groups: ${catalog.groups.map((group) => group.id).join(", ") || "none"}.`,
    );
  }
  if (
    options.workspace !== undefined &&
    !catalog.commands.some((command) => matchesWorkspace(command, options.workspace as string))
  ) {
    const available = [...new Set(catalog.commands.map((command) => command.workspace.name))];
    throw new RunpaletteError(
      "WORKSPACE_NOT_FOUND",
      `Workspace ${JSON.stringify(options.workspace)} was not found.`,
      `Available workspaces: ${available.join(", ") || "root only"}.`,
    );
  }
  const commands = catalog.commands.filter(
    (command) =>
      (options.group === undefined || command.group === options.group) &&
      (options.workspace === undefined || matchesWorkspace(command, options.workspace)),
  );
  const ids = new Set(commands.map((command) => command.id));
  const filtered: CommandCatalog = {
    ...catalog,
    groups: catalog.groups
      .filter((group) => options.group === undefined || group.id === options.group)
      .map((group) => ({
        ...group,
        commands: group.commands.filter((command) => ids.has(command.id)),
      }))
      .filter((group) => group.commands.length > 0),
    commands,
    ...(catalog.defaultCommandId !== undefined && ids.has(catalog.defaultCommandId)
      ? { defaultCommandId: catalog.defaultCommandId }
      : {}),
  };
  if (catalog.defaultCommandId !== undefined && !ids.has(catalog.defaultCommandId)) {
    delete filtered.defaultCommandId;
  }
  return filtered;
}

export function catalogForOutput(catalog: CommandCatalog, invocationCwd: string): CommandCatalog {
  const relativeRoot = relative(invocationCwd, catalog.project.root) || ".";
  const relativeManifest = relative(invocationCwd, catalog.project.manifestPath);
  const commandForOutput = (command: CatalogCommand): CatalogCommand => ({
    ...command,
    workspace: {
      ...command.workspace,
      root: relative(invocationCwd, command.workspace.root) || ".",
    },
    source: { ...command.source, path: relative(invocationCwd, command.source.path) },
  });
  return {
    ...catalog,
    project: { ...catalog.project, root: relativeRoot, manifestPath: relativeManifest },
    groups: catalog.groups.map((group) => ({
      ...group,
      commands: group.commands.map(commandForOutput),
    })),
    commands: catalog.commands.map(commandForOutput),
  };
}

export function commandMatchesWorkspace(command: CatalogCommand, selector: string): boolean {
  return matchesWorkspace(command, selector);
}
