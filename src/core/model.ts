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
}

export interface ProjectContext {
  root: string;
  manifestPath: string;
  name: string;
  manifest: ProjectManifest;
  packageManager: PackageManagerResolution;
}

export const COMMAND_GROUPS = [
  { id: "develop", label: "Start & develop" },
  { id: "quality", label: "Test & quality" },
  { id: "build", label: "Build & release" },
  { id: "operations", label: "Data & operations" },
  { id: "other", label: "Other" },
] as const;

export type CommandGroupId = (typeof COMMAND_GROUPS)[number]["id"];

export interface CatalogCommand {
  id: string;
  name: string;
  script: string;
  group: CommandGroupId;
  source: {
    kind: "package.json";
    path: string;
  };
}

export interface HiddenCommand {
  name: string;
  reason: "lifecycle" | "self";
}

export interface CommandCatalog {
  schemaVersion: 1;
  project: {
    name: string;
    root: string;
    manifestPath: string;
  };
  packageManager: PackageManagerResolution;
  groups: Array<{
    id: CommandGroupId;
    label: string;
    commands: CatalogCommand[];
  }>;
  commands: CatalogCommand[];
  hidden: HiddenCommand[];
}

export interface ExecutionPlan {
  schemaVersion: 1;
  command: "run";
  script: {
    name: string;
    value: string;
  };
  packageManager: PackageManagerName;
  executable: string;
  args: string[];
  cwd: string;
}
