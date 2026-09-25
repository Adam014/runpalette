import { readFile, stat } from "node:fs/promises";
import { basename, dirname, join, parse, resolve } from "node:path";
import { RunpaletteError } from "./errors.js";
import type { ProjectContext, ProjectManifest } from "./model.js";
import { resolvePackageManager } from "./package-manager.js";
import { discoverWorkspaces, hasWorkspaceDeclaration } from "./workspaces.js";

async function startDirectory(path: string): Promise<string> {
  const absolute = resolve(path);
  try {
    const details = await stat(absolute);
    return details.isDirectory() ? absolute : dirname(absolute);
  } catch {
    throw new RunpaletteError(
      "PROJECT_PATH_INVALID",
      `Project path does not exist: ${absolute}`,
      "Choose an existing directory with --cwd.",
    );
  }
}

async function findManifest(start: string): Promise<string> {
  let current = await startDirectory(start);
  const filesystemRoot = parse(current).root;

  while (true) {
    const candidate = join(current, "package.json");
    try {
      const details = await stat(candidate);
      if (details.isFile()) return candidate;
    } catch {
      // Continue toward the filesystem root.
    }

    if (current === filesystemRoot) break;
    current = dirname(current);
  }

  throw new RunpaletteError(
    "PROJECT_NOT_FOUND",
    `No package.json found from ${resolve(start)} upward.`,
    "Run Runpalette inside a JavaScript project or pass --cwd PATH.",
  );
}

export function parseManifest(text: string, manifestPath: string): ProjectManifest {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Invalid JSON";
    throw new RunpaletteError(
      "MANIFEST_INVALID",
      `Cannot parse ${manifestPath}: ${detail}`,
      "Fix package.json before running Runpalette again.",
    );
  }

  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new RunpaletteError(
      "MANIFEST_INVALID",
      `${manifestPath} must contain a JSON object.`,
      "Fix package.json before running Runpalette again.",
    );
  }

  const record = value as Record<string, unknown>;
  if (record.scripts !== undefined) {
    if (
      typeof record.scripts !== "object" ||
      record.scripts === null ||
      Array.isArray(record.scripts)
    ) {
      throw new RunpaletteError(
        "SCRIPTS_INVALID",
        `The scripts field in ${manifestPath} must be an object.`,
        "Use string values under package.json scripts.",
      );
    }
    for (const [name, script] of Object.entries(record.scripts)) {
      if (typeof script !== "string") {
        throw new RunpaletteError(
          "SCRIPTS_INVALID",
          `Script ${JSON.stringify(name)} in ${manifestPath} must be a string.`,
          "Use string values under package.json scripts.",
        );
      }
    }
  }

  return {
    ...(typeof record.name === "string" ? { name: record.name } : {}),
    ...(typeof record.packageManager === "string" ? { packageManager: record.packageManager } : {}),
    ...(record.scripts === undefined ? {} : { scripts: record.scripts as Record<string, string> }),
    ...(record.workspaces === undefined ? {} : { workspaces: record.workspaces }),
  };
}

async function findProjectManifest(start: string): Promise<string> {
  const nearest = await findManifest(start);
  let currentDirectory = dirname(nearest);
  const filesystemRoot = parse(dirname(nearest)).root;
  while (true) {
    const candidate = join(currentDirectory, "package.json");
    try {
      if ((await stat(candidate)).isFile()) {
        const manifest = parseManifest(await readFile(candidate, "utf8"), candidate);
        if (await hasWorkspaceDeclaration(currentDirectory, manifest)) return candidate;
      }
    } catch {
      // Keep walking: workspace roots commonly have package-less parent folders.
    }
    if (currentDirectory === filesystemRoot) return nearest;
    currentDirectory = dirname(currentDirectory);
  }
}

export async function discoverProject(options: {
  cwd: string;
  packageManager?: string;
}): Promise<ProjectContext> {
  const manifestPath = await findProjectManifest(options.cwd);
  let text: string;
  try {
    text = await readFile(manifestPath, "utf8");
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown read error";
    throw new RunpaletteError(
      "MANIFEST_READ_FAILED",
      `Cannot read ${manifestPath}: ${detail}`,
      "Check the file permissions and try again.",
    );
  }

  const manifest = parseManifest(text, manifestPath);
  const root = dirname(manifestPath);
  const packageManager = await resolvePackageManager({
    root,
    manifest,
    ...(options.packageManager === undefined ? {} : { explicit: options.packageManager }),
  });
  const workspaces = await discoverWorkspaces({ root, manifest, parseManifest });

  return {
    root,
    manifestPath,
    name: manifest.name?.trim() || basename(root),
    manifest,
    packageManager,
    workspaces,
  };
}
