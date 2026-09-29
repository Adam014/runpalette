import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import process from "node:process";
import spawn from "cross-spawn";
import { parse as parseToml } from "smol-toml";
import { executableAvailable } from "../process/executable.js";
import { terminateProcessTree } from "../process/terminate.js";
import type {
  CommandSourceKind,
  DiscoveredCommand,
  ProjectContext,
  SourceDiagnostic,
} from "./model.js";

const MAX_DISCOVERY_OUTPUT = 2 * 1024 * 1024;
const DISCOVERY_TIMEOUT_MS = 15_000;

interface CaptureResult {
  code: number;
  stdout: string;
  stderr: string;
}

async function file(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

async function firstFile(root: string, names: readonly string[]): Promise<string | undefined> {
  for (const name of names) {
    const candidate = join(root, name);
    if (await file(candidate)) return candidate;
  }
  return undefined;
}

export function captureCommand(
  executable: string,
  args: readonly string[],
  cwd: string,
  options: { timeoutMs?: number; maxBytes?: number } = {},
): Promise<CaptureResult> {
  const timeoutMs = options.timeoutMs ?? DISCOVERY_TIMEOUT_MS;
  const maxBytes = options.maxBytes ?? MAX_DISCOVERY_OUTPUT;
  return new Promise((resolve, reject) => {
    const child = spawn(executable, [...args], {
      cwd,
      env: process.env,
      detached: process.platform !== "win32",
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    let timer: NodeJS.Timeout | undefined;
    let forceTimer: NodeJS.Timeout | undefined;
    const stop = (): void => {
      terminateProcessTree(child, "SIGTERM");
      forceTimer = setTimeout(() => terminateProcessTree(child, "SIGKILL", true), 1_000);
      forceTimer.unref?.();
    };
    const finish = (callback: () => void): void => {
      if (settled) return;
      settled = true;
      if (timer !== undefined) clearTimeout(timer);
      callback();
    };
    const append = (current: string, chunk: Buffer): string => {
      if (settled) return current;
      const next = current + chunk.toString("utf8");
      if (Buffer.byteLength(next) > maxBytes) {
        stop();
        finish(() => reject(new Error(`Discovery output exceeded ${String(maxBytes)} bytes.`)));
      }
      return next;
    };
    child.stdout?.on("data", (chunk: Buffer) => {
      stdout = append(stdout, chunk);
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr = append(stderr, chunk);
    });
    child.once("error", (error) => finish(() => reject(error)));
    child.once("close", (code) => {
      if (forceTimer !== undefined) clearTimeout(forceTimer);
      finish(() => resolve({ code: code ?? 1, stdout, stderr }));
    });
    timer = setTimeout(() => {
      stop();
      finish(() => reject(new Error(`Discovery timed out after ${String(timeoutMs)}ms.`)));
    }, timeoutMs);
    timer.unref?.();
  });
}

function command(
  source: CommandSourceKind,
  path: string,
  executable: string,
  name: string,
  description?: string,
  forwardedArgsSeparator?: string,
): DiscoveredCommand {
  return {
    name,
    ...(description === undefined || description.trim() === ""
      ? {}
      : { description: description.trim() }),
    script: [executable, name].join(" "),
    source: { kind: source, path },
    execution: {
      executable,
      args: [name],
      ...(forwardedArgsSeparator === undefined ? {} : { forwardedArgsSeparator }),
    },
  };
}

export function parseMakefile(
  text: string,
  path: string,
  executable = "make",
): DiscoveredCommand[] {
  const phony = new Set<string>();
  const candidates = new Map<string, string | undefined>();
  for (const rawLine of text.split(/\r?\n/u)) {
    if (/^\s/u.test(rawLine) || rawLine.trimStart().startsWith("#")) continue;
    const phonyMatch = rawLine.match(/^\.PHONY\s*:\s*(.*)$/u);
    if (phonyMatch?.[1] !== undefined) {
      for (const name of phonyMatch[1].split(/\s+/u).filter(Boolean)) phony.add(name);
      continue;
    }
    const match = rawLine.match(/^([^:#=\s][^:#=]*?)\s*:(?![=])[^#]*(?:##\s*(.*))?$/u);
    if (match?.[1] === undefined) continue;
    const description = match[2]?.trim();
    for (const name of match[1].trim().split(/\s+/u)) {
      if (name.startsWith(".") || name.includes("%") || name.includes("$")) continue;
      candidates.set(name, description);
    }
  }
  return [...candidates.entries()]
    .filter(([name, description]) => phony.has(name) || description !== undefined)
    .map(([name, description]) => command("make", path, executable, name, description));
}

export function parseCargoAliases(text: string, path: string): DiscoveredCommand[] {
  const parsed = parseToml(text) as Record<string, unknown>;
  const aliases = parsed.alias;
  if (typeof aliases !== "object" || aliases === null || Array.isArray(aliases)) return [];
  return Object.entries(aliases as Record<string, unknown>).flatMap(([name, value]) => {
    const detail =
      typeof value === "string"
        ? value
        : Array.isArray(value) && value.every((part) => typeof part === "string")
          ? value.join(" ")
          : undefined;
    if (detail === undefined) return [];
    return [
      {
        ...command("cargo", path, "cargo", name, `cargo ${detail}`),
        script: `cargo ${name} -> ${detail}`,
      },
    ];
  });
}

export function parseJustDump(text: string, path: string): DiscoveredCommand[] {
  const root = JSON.parse(text) as Record<string, unknown>;
  const commands: DiscoveredCommand[] = [];
  const visit = (value: unknown, prefix = ""): void => {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return;
    const record = value as Record<string, unknown>;
    const recipes = record.recipes;
    if (typeof recipes === "object" && recipes !== null && !Array.isArray(recipes)) {
      for (const [name, recipe] of Object.entries(recipes as Record<string, unknown>)) {
        if (typeof recipe !== "object" || recipe === null || Array.isArray(recipe)) continue;
        const metadata = recipe as Record<string, unknown>;
        if (metadata.private === true) continue;
        const qualified = prefix === "" ? name : `${prefix}::${name}`;
        commands.push(
          command(
            "just",
            path,
            "just",
            qualified,
            typeof metadata.doc === "string" ? metadata.doc : undefined,
          ),
        );
      }
    }
    const modules = record.modules;
    if (typeof modules === "object" && modules !== null && !Array.isArray(modules)) {
      for (const [name, module] of Object.entries(modules as Record<string, unknown>)) {
        visit(module, prefix === "" ? name : `${prefix}::${name}`);
      }
    }
  };
  visit(root);
  return commands;
}

export function parseTaskList(text: string, path: string): DiscoveredCommand[] {
  const parsed = JSON.parse(text) as unknown;
  const values = Array.isArray(parsed)
    ? parsed
    : typeof parsed === "object" &&
        parsed !== null &&
        Array.isArray((parsed as { tasks?: unknown }).tasks)
      ? ((parsed as { tasks: unknown[] }).tasks ?? [])
      : [];
  return values.flatMap((value) => {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return [];
    const record = value as Record<string, unknown>;
    const name = typeof record.task === "string" ? record.task : record.name;
    if (typeof name !== "string" || name === "") return [];
    const description =
      typeof record.desc === "string"
        ? record.desc
        : typeof record.description === "string"
          ? record.description
          : undefined;
    return [command("task", path, "task", name, description, "--")];
  });
}

export function parseGradleTasks(
  text: string,
  path: string,
  executable: string,
): DiscoveredCommand[] {
  const lines = text.split(/\r?\n/u);
  const commands: DiscoveredCommand[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]?.trim() ?? "";
    if (line === "" || /^-+$/u.test(line) || /^>/u.test(line)) continue;
    if (/^-+$/u.test(lines[index + 1]?.trim() ?? "")) continue;
    const match = line.match(/^(:?[\p{L}\p{N}_][^\s/\\<>"?*|]*)(?:\s+-\s+(.*))?$/u);
    if (match?.[1] === undefined || seen.has(match[1])) continue;
    seen.add(match[1]);
    commands.push(command("gradle", path, executable, match[1], match[2]));
  }
  return commands;
}

function diagnostic(source: CommandSourceKind, message: string, hint?: string): SourceDiagnostic {
  return { source, level: "warning", message, ...(hint === undefined ? {} : { hint }) };
}

async function nativeSource(options: {
  source: "just" | "task" | "gradle";
  path: string;
  executable: string;
  args: string[];
  root: string;
  parse: (text: string, path: string, executable: string) => DiscoveredCommand[];
}): Promise<{ commands: DiscoveredCommand[]; diagnostics: SourceDiagnostic[] }> {
  if (!executableAvailable(options.executable)) {
    return {
      commands: [],
      diagnostics: [
        diagnostic(
          options.source,
          `${options.source} source found, but ${options.executable} is not available.`,
          `Install ${options.source} to discover and run its project commands.`,
        ),
      ],
    };
  }
  try {
    const result = await captureCommand(options.executable, options.args, options.root);
    if (result.code !== 0) {
      return {
        commands: [],
        diagnostics: [
          diagnostic(
            options.source,
            `${options.source} command discovery failed with exit code ${String(result.code)}.`,
            result.stderr.trim().split(/\r?\n/u)[0] ||
              "Run the source tool directly to inspect its error.",
          ),
        ],
      };
    }
    return {
      commands: options.parse(result.stdout, options.path, options.executable),
      diagnostics: [],
    };
  } catch (error) {
    return {
      commands: [],
      diagnostics: [
        diagnostic(
          options.source,
          `${options.source} command discovery failed: ${error instanceof Error ? error.message : String(error)}`,
        ),
      ],
    };
  }
}

export async function discoverExternalCommands(project: ProjectContext): Promise<{
  commands: DiscoveredCommand[];
  diagnostics: SourceDiagnostic[];
}> {
  const commands: DiscoveredCommand[] = [];
  const diagnostics: SourceDiagnostic[] = [];
  const makefile = await firstFile(project.root, ["GNUmakefile", "Makefile", "makefile"]);
  if (makefile !== undefined) {
    try {
      commands.push(...parseMakefile(await readFile(makefile, "utf8"), makefile));
    } catch (error) {
      diagnostics.push(
        diagnostic(
          "make",
          `Cannot read Make source: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    }
  }

  const cargoConfig = await firstFile(project.root, [".cargo/config.toml", ".cargo/config"]);
  if (cargoConfig !== undefined) {
    try {
      commands.push(...parseCargoAliases(await readFile(cargoConfig, "utf8"), cargoConfig));
    } catch (error) {
      diagnostics.push(
        diagnostic(
          "cargo",
          `Cannot parse Cargo aliases: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    }
  }

  const justfile = await firstFile(project.root, ["justfile", "Justfile", ".justfile"]);
  if (justfile !== undefined) {
    const result = await nativeSource({
      source: "just",
      path: justfile,
      executable: "just",
      args: ["--dump", "--dump-format", "json"],
      root: project.root,
      parse: (text, path) => parseJustDump(text, path),
    });
    commands.push(...result.commands);
    diagnostics.push(...result.diagnostics);
  }

  const taskfile = await firstFile(project.root, [
    "Taskfile.yml",
    "Taskfile.yaml",
    "taskfile.yml",
    "taskfile.yaml",
    "Taskfile.dist.yml",
    "Taskfile.dist.yaml",
  ]);
  if (taskfile !== undefined) {
    const result = await nativeSource({
      source: "task",
      path: taskfile,
      executable: "task",
      args: ["--list-all", "--json"],
      root: project.root,
      parse: (text, path) => parseTaskList(text, path),
    });
    commands.push(...result.commands);
    diagnostics.push(...result.diagnostics);
  }

  const gradleFile = await firstFile(project.root, [
    "settings.gradle",
    "settings.gradle.kts",
    "build.gradle",
    "build.gradle.kts",
  ]);
  if (gradleFile !== undefined) {
    const wrapper = await firstFile(
      project.root,
      process.platform === "win32" ? ["gradlew.bat", "gradlew"] : ["gradlew"],
    );
    const executable = wrapper ?? "gradle";
    const result = await nativeSource({
      source: "gradle",
      path: gradleFile,
      executable,
      args: ["--no-daemon", "--no-scan", "--console=plain", "--quiet", "tasks", "--all"],
      root: project.root,
      parse: parseGradleTasks,
    });
    commands.push(...result.commands);
    diagnostics.push(...result.diagnostics);
  }

  return { commands, diagnostics };
}
