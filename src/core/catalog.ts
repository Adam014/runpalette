import { relative } from "node:path";
import type {
  CatalogCommand,
  CommandCatalog,
  CommandGroupId,
  HiddenCommand,
  ProjectContext,
} from "./model.js";
import { COMMAND_GROUPS } from "./model.js";

const GROUP_PATTERNS: ReadonlyArray<{
  id: Exclude<CommandGroupId, "other">;
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
  if (name.startsWith("pre") && name.length > 3) return allNames.has(name.slice(3));
  if (name.startsWith("post") && name.length > 4) return allNames.has(name.slice(4));
  return false;
}

function isSelfAlias(name: string, script: string): boolean {
  if (name !== "what" && name !== "runpalette") return false;
  return /(^|\s|\/)(?:runpalette)(?:\s|$)/u.test(script);
}

export function createCatalog(project: ProjectContext): CommandCatalog {
  const scripts = project.manifest.scripts ?? {};
  const names = Object.keys(scripts);
  const allNames = new Set(names);
  const commands: CatalogCommand[] = [];
  const hidden: HiddenCommand[] = [];

  for (const name of names) {
    const script = scripts[name];
    if (script === undefined) continue;
    if (isLifecycleScript(name, allNames)) {
      hidden.push({ name, reason: "lifecycle" });
      continue;
    }
    if (isSelfAlias(name, script)) {
      hidden.push({ name, reason: "self" });
      continue;
    }
    commands.push({
      id: `package:${name}`,
      name,
      script,
      group: classifyCommand(name),
      source: { kind: "package.json", path: project.manifestPath },
    });
  }

  return {
    schemaVersion: 1,
    project: {
      name: project.name,
      root: project.root,
      manifestPath: project.manifestPath,
    },
    packageManager: project.packageManager,
    groups: COMMAND_GROUPS.map((group) => ({
      ...group,
      commands: commands.filter((command) => command.group === group.id),
    })).filter((group) => group.commands.length > 0),
    commands,
    hidden,
  };
}

export function catalogForOutput(catalog: CommandCatalog, invocationCwd: string): CommandCatalog {
  const relativeRoot = relative(invocationCwd, catalog.project.root) || ".";
  const relativeManifest = relative(invocationCwd, catalog.project.manifestPath);
  return {
    ...catalog,
    project: {
      ...catalog.project,
      root: relativeRoot,
      manifestPath: relativeManifest,
    },
    groups: catalog.groups.map((group) => ({
      ...group,
      commands: group.commands.map((command) => ({
        ...command,
        source: { ...command.source, path: relativeManifest },
      })),
    })),
    commands: catalog.commands.map((command) => ({
      ...command,
      source: { ...command.source, path: relativeManifest },
    })),
  };
}
