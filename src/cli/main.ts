import { readFile } from "node:fs/promises";
import { relative } from "node:path";
import process from "node:process";
import { catalogForOutput, createCatalog, filterCatalog } from "../core/catalog.js";
import { loadConfig } from "../core/config.js";
import { RunpaletteError } from "../core/errors.js";
import { createExecutionPlan } from "../core/plan.js";
import { discoverProject } from "../core/project.js";
import { executePlan } from "../process/run.js";
import { confirmExecution } from "../ui/confirm.js";
import { openPalette } from "../ui/palette.js";
import { renderPlainCatalog, renderPlan } from "../ui/plain.js";
import { style } from "../ui/style.js";
import { terminalCapabilities } from "../ui/terminal.js";
import { parseArguments } from "./arguments.js";
import { HELP } from "./help.js";

async function packageVersion(): Promise<string> {
  try {
    const url = new URL("../../package.json", import.meta.url);
    const parsed = JSON.parse(await readFile(url, "utf8")) as { version?: unknown };
    return typeof parsed.version === "string" ? parsed.version : "unknown";
  } catch {
    return "unknown";
  }
}

function success(command: string, data: unknown, warnings: readonly string[] = []): string {
  return `${JSON.stringify({ schemaVersion: 1, ok: true, command, data, warnings })}\n`;
}

function failure(error: unknown): { text: string; code: number } {
  if (error instanceof RunpaletteError) {
    return {
      text: `${JSON.stringify({
        schemaVersion: 1,
        ok: false,
        error: { code: error.code, message: error.message, hint: error.hint ?? null },
      })}\n`,
      code: 2,
    };
  }
  const message = error instanceof Error ? error.message : String(error);
  return {
    text: `${JSON.stringify({
      schemaVersion: 1,
      ok: false,
      error: { code: "INTERNAL_ERROR", message, hint: null },
    })}\n`,
    code: 1,
  };
}

export async function main(argv: readonly string[] = process.argv.slice(2)): Promise<number> {
  let parsed: ReturnType<typeof parseArguments> | undefined;
  try {
    parsed = parseArguments(argv, process.cwd());
    if (parsed.command === "help") {
      process.stdout.write(HELP);
      return 0;
    }
    if (parsed.command === "version") {
      const version = await packageVersion();
      process.stdout.write(parsed.json ? success("version", { version }) : `${version}\n`);
      return 0;
    }

    const project = await discoverProject({
      cwd: parsed.cwd,
      ...(parsed.packageManager === undefined ? {} : { packageManager: parsed.packageManager }),
    });
    const config = await loadConfig({
      root: project.root,
      ...(parsed.config === undefined ? {} : { path: parsed.config }),
    });
    const completeCatalog = createCatalog(project, config);
    const catalog =
      parsed.command === "run"
        ? completeCatalog
        : filterCatalog(completeCatalog, {
            ...(parsed.group === undefined ? {} : { group: parsed.group }),
            ...(parsed.workspace === undefined ? {} : { workspace: parsed.workspace }),
          });
    const capabilities = terminalCapabilities({
      input: process.stdin,
      output: process.stderr,
      environment: process.env,
      nonInteractive: parsed.nonInteractive,
      color: parsed.color,
      unicode: parsed.unicode,
    });

    if (parsed.command === "list" || (parsed.command === "home" && !capabilities.interactive)) {
      if (parsed.json) {
        process.stdout.write(
          success(
            "list",
            catalogForOutput(catalog, process.cwd()),
            catalog.packageManager.warnings,
          ),
        );
      } else {
        process.stdout.write(renderPlainCatalog(catalog, capabilities));
        for (const warning of catalog.packageManager.warnings) {
          process.stderr.write(`! ${warning}\n`);
        }
      }
      return 0;
    }

    let scriptName = parsed.scriptName;
    let selectedWorkspace = parsed.workspace;
    if (parsed.command === "home") {
      const selection = await openPalette({
        catalog,
        input: process.stdin,
        output: process.stderr,
        capabilities,
      });
      if (selection.kind === "cancelled") return selection.reason === "interrupt" ? 130 : 0;
      if (selection.kind === "unavailable") {
        process.stdout.write(renderPlainCatalog(catalog, capabilities));
        return catalog.commands.length === 0 ? 2 : 0;
      }
      scriptName = selection.command.name;
      selectedWorkspace = selection.command.workspace.path;
    }

    if (scriptName === undefined) throw new Error("Command selection invariant failed.");
    const plan = createExecutionPlan(
      completeCatalog,
      scriptName,
      parsed.scriptArgs,
      selectedWorkspace,
    );
    if (parsed.dryRun) {
      process.stdout.write(
        parsed.json
          ? success(
              "run",
              catalogForOutputPlan(plan, process.cwd()),
              catalog.packageManager.warnings,
            )
          : renderPlan(plan),
      );
      return 0;
    }
    if (parsed.json) {
      throw new RunpaletteError(
        "ARGUMENT_INVALID",
        "JSON execution requires --dry-run in this pre-release build.",
        "Use --dry-run for a machine-readable plan or run without --json.",
      );
    }

    if (plan.safety.confirmationRequired && !parsed.yes) {
      if (!capabilities.interactive) {
        throw new RunpaletteError(
          "CONFIRMATION_REQUIRED",
          `Command ${JSON.stringify(plan.script.name)} requires confirmation.`,
          "Review it with --dry-run, then re-run with --yes.",
        );
      }
      if (!(await confirmExecution(plan, {}, capabilities.unicode))) {
        process.stderr.write("Cancelled.\n");
        return 0;
      }
    }

    process.stderr.write(`\n${style.accent("›", capabilities)} ${renderPlan(plan).trimStart()}\n`);
    return await executePlan(plan);
  } catch (error) {
    const result = failure(error);
    if (parsed?.json === true || argv.includes("--json")) {
      process.stdout.write(result.text);
    } else {
      const payload = JSON.parse(result.text) as {
        error: { message: string; hint: string | null };
      };
      process.stderr.write(`Runpalette: ${payload.error.message}\n`);
      if (payload.error.hint !== null) process.stderr.write(`Hint: ${payload.error.hint}\n`);
    }
    return result.code;
  }
}

function catalogForOutputPlan(
  plan: ReturnType<typeof createExecutionPlan>,
  invocationCwd: string,
): ReturnType<typeof createExecutionPlan> {
  return {
    ...plan,
    cwd: relative(invocationCwd, plan.cwd) || ".",
    workspace: {
      ...plan.workspace,
      root: relative(invocationCwd, plan.workspace.root) || ".",
    },
  };
}
