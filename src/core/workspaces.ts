import { readFile, stat } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import fg from "fast-glob";
import { parse as parseYaml } from "yaml";
import { RunpaletteError } from "./errors.js";
import type { ProjectManifest, ProjectWorkspace } from "./model.js";

async function isFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

function manifestPatterns(workspaces: unknown): string[] {
  if (workspaces === undefined) return [];
  const value = Array.isArray(workspaces)
    ? workspaces
    : typeof workspaces === "object" && workspaces !== null
      ? (workspaces as Record<string, unknown>).packages
      : undefined;
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    throw new RunpaletteError(
      "MANIFEST_INVALID",
      "package.json workspaces must be an array of strings or an object with a packages array.",
      "Use workspace directory glob patterns such as packages/*.",
    );
  }
  return value as string[];
}

async function pnpmPatterns(root: string): Promise<string[]> {
  const path = join(root, "pnpm-workspace.yaml");
  if (!(await isFile(path))) return [];
  let parsed: unknown;
  try {
    parsed = parseYaml(await readFile(path, "utf8"));
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Invalid YAML";
    throw new RunpaletteError(
      "MANIFEST_INVALID",
      `Cannot parse ${path}: ${detail}`,
      "Fix pnpm-workspace.yaml before running Runpalette again.",
    );
  }
  const packages =
    typeof parsed === "object" && parsed !== null
      ? (parsed as Record<string, unknown>).packages
      : undefined;
  if (packages === undefined) return [];
  if (!Array.isArray(packages) || packages.some((entry) => typeof entry !== "string")) {
    throw new RunpaletteError(
      "MANIFEST_INVALID",
      `${path} packages must be an array of strings.`,
      "Use workspace directory glob patterns such as packages/*.",
    );
  }
  return packages as string[];
}

export async function hasWorkspaceDeclaration(
  root: string,
  manifest: ProjectManifest,
): Promise<boolean> {
  return manifest.workspaces !== undefined || (await isFile(join(root, "pnpm-workspace.yaml")));
}

function packageJsonPatterns(patterns: readonly string[]): string[] {
  return patterns.map((pattern) => {
    const negative = pattern.startsWith("!");
    const body = negative ? pattern.slice(1) : pattern;
    const normalized = body.replace(/\/+$/u, "");
    return `${negative ? "!" : ""}${normalized}/package.json`;
  });
}

export async function discoverWorkspaces(options: {
  root: string;
  manifest: ProjectManifest;
  parseManifest(text: string, path: string): ProjectManifest;
}): Promise<ProjectWorkspace[]> {
  const patterns = [
    ...manifestPatterns(options.manifest.workspaces),
    ...(await pnpmPatterns(options.root)),
  ];
  if (patterns.length === 0) return [];

  const files = await fg(packageJsonPatterns(patterns), {
    cwd: options.root,
    absolute: true,
    onlyFiles: true,
    unique: true,
    followSymbolicLinks: false,
    ignore: ["**/node_modules/**"],
  });
  const rootPrefix = `${resolve(options.root)}${sep}`;
  const workspaces: ProjectWorkspace[] = [];
  for (const file of files.sort((left, right) => left.localeCompare(right))) {
    const manifestPath = resolve(file);
    if (
      !manifestPath.startsWith(rootPrefix) ||
      manifestPath === join(options.root, "package.json")
    ) {
      continue;
    }
    const workspaceRoot = dirname(manifestPath);
    let text: string;
    try {
      text = await readFile(manifestPath, "utf8");
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Unknown read error";
      throw new RunpaletteError("MANIFEST_READ_FAILED", `Cannot read ${manifestPath}: ${detail}`);
    }
    const manifest = options.parseManifest(text, manifestPath);
    const relativePath = relative(options.root, workspaceRoot).split(sep).join("/");
    workspaces.push({
      name: manifest.name?.trim() || relativePath,
      root: workspaceRoot,
      manifestPath,
      relativePath,
      manifest,
    });
  }
  return workspaces;
}
