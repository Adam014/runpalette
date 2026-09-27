export const PACKAGE_MANAGERS = ["npm", "pnpm", "yarn", "bun"] as const;

export type PackageManagerName = (typeof PACKAGE_MANAGERS)[number];

export type PackageManagerEvidenceSource = "explicit" | "packageManager" | "lockfile" | "fallback";

export interface PackageManagerEvidence {
  source: PackageManagerEvidenceSource;
  detail: string;
}

export interface PackageManagerResolution {
  name: PackageManagerName;
  evidence: PackageManagerEvidence;
  warnings: string[];
}

export interface ProjectManifest {
  name?: string;
  packageManager?: string;
  scripts?: Record<string, string>;
  workspaces?: unknown;
}

export interface ProjectWorkspace {
  name: string;
  root: string;
  manifestPath: string;
  relativePath: string;
  manifest: ProjectManifest;
}

export interface ProjectContext {
  root: string;
  name: string;
  manifestPath?: string;
  manifest?: ProjectManifest;
  packageManager?: PackageManagerResolution;
  workspaces: ProjectWorkspace[];
}

export const COMMAND_SOURCES = ["package", "just", "task", "make", "cargo", "gradle"] as const;
export type CommandSourceKind = (typeof COMMAND_SOURCES)[number];

export interface DiscoveredCommand {
  name: string;
  label?: string;
  description?: string;
  script: string;
  source: {
    kind: CommandSourceKind;
    path: string;
  };
  execution: {
    executable: string;
    args: string[];
    forwardedArgsSeparator?: string;
  };
}

export interface SourceDiagnostic {
  source: CommandSourceKind;
  level: "warning" | "error";
  message: string;
  hint?: string;
}

export const COMMAND_GROUPS = [
  { id: "develop", label: "Start & develop" },
  { id: "quality", label: "Test & quality" },
  { id: "build", label: "Build & release" },
  { id: "operations", label: "Data & operations" },
  { id: "other", label: "Other" },
] as const;

export type BuiltInCommandGroupId = (typeof COMMAND_GROUPS)[number]["id"];
export type CommandGroupId = string;

export interface CommandSafety {
  confirmationRequired: boolean;
  message?: string;
}

export interface CommandWorkspace {
  name: string;
  path: string;
  root: string;
  isRoot: boolean;
}

export interface CatalogCommand {
  id: string;
  name: string;
  label: string;
  description?: string;
  aliases: string[];
  script: string;
  group: CommandGroupId;
  order: number;
  safety: CommandSafety;
  workspace: CommandWorkspace;
  source: {
    kind: CommandSourceKind;
    path: string;
  };
  execution: {
    executable: string;
    args: string[];
    forwardedArgsSeparator?: string;
  };
}

export interface HiddenCommand {
  name: string;
  workspace: string;
  reason: "lifecycle" | "self" | "config";
}

export interface CommandCatalog {
  schemaVersion: 1;
  project: {
    name: string;
    root: string;
    manifestPath?: string;
    workspaceCount: number;
  };
  packageManager?: PackageManagerResolution;
  sources: CommandSourceKind[];
  diagnostics: SourceDiagnostic[];
  groups: Array<{
    id: string;
    label: string;
    commands: CatalogCommand[];
  }>;
  commands: CatalogCommand[];
  hidden: HiddenCommand[];
  defaultCommandId?: string;
}

export interface ExecutionPlan {
  schemaVersion: 1;
  command: "run";
  script: {
    name: string;
    value: string;
    requestedAs: string;
  };
  workspace: CommandWorkspace;
  safety: CommandSafety;
  source: CatalogCommand["source"];
  packageManager?: PackageManagerName;
  executable: string;
  args: string[];
  cwd: string;
}
