import process from "node:process";
import { catalogForOutput } from "../core/catalog.js";
import { RunpaletteError } from "../core/errors.js";
import { createExecutionPlan, planForOutput } from "../core/plan.js";
import { catalogWarnings, loadCatalog } from "../core/service.js";
import { packageVersion } from "../core/version.js";
import { runMcpServer } from "../mcp/server.js";
import { executeCaptured } from "../process/capture.js";
import { executePlan } from "../process/run.js";
import { confirmExecution } from "../ui/confirm.js";
import { openPalette } from "../ui/palette.js";
import { renderPlainCatalog, renderPlan } from "../ui/plain.js";
import { style } from "../ui/style.js";
import { terminalCapabilities } from "../ui/terminal.js";
import { parseArguments } from "./arguments.js";
import { renderHelp } from "./help.js";

function success(command: string, data: unknown, warnings: readonly string[] = []): string {
  return `${JSON.stringify({ schemaVersion: 1, ok: true, command, data, warnings })}\n`;
}

function executionResult(data: unknown, ok: boolean, warnings: readonly string[] = []): string {
  return `${JSON.stringify({ schemaVersion: 1, ok, command: "run", data, warnings })}\n`;
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
    const capabilities = terminalCapabilities({
      input: process.stdin,
      output: process.stderr,
      environment: process.env,
      nonInteractive: parsed.nonInteractive,
      color: parsed.color,
      unicode: parsed.unicode,
    });
    if (parsed.command === "help") {
      const help = renderHelp(capabilities.unicode);
      process.stdout.write(parsed.json ? success("help", { text: help }) : help);
      return 0;
    }
    if (parsed.command === "version") {
      const version = await packageVersion();
      process.stdout.write(parsed.json ? success("version", { version }) : `${version}\n`);
      return 0;
    }
    if (parsed.command === "mcp") {
      await runMcpServer({
        cwd: parsed.cwd,
        ...(parsed.config === undefined ? {} : { config: parsed.config }),
        ...(parsed.packageManager === undefined ? {} : { packageManager: parsed.packageManager }),
        allowExecution: parsed.allowExecution,
      });
      return 0;
    }

    const loaded = await loadCatalog({
      cwd: parsed.cwd,
      ...(parsed.packageManager === undefined ? {} : { packageManager: parsed.packageManager }),
      ...(parsed.config === undefined ? {} : { config: parsed.config }),
      ...(parsed.group === undefined ? {} : { group: parsed.group }),
      ...(parsed.workspace === undefined ? {} : { workspace: parsed.workspace }),
      ...(parsed.source === undefined ? {} : { source: parsed.source }),
    });
    const completeCatalog = loaded.complete;
    const catalog = parsed.command === "run" ? completeCatalog : loaded.filtered;
    if (parsed.command === "list" || (parsed.command === "home" && !capabilities.interactive)) {
      if (parsed.json) {
        process.stdout.write(
          success("list", catalogForOutput(catalog, process.cwd()), catalogWarnings(catalog)),
        );
      } else {
        process.stdout.write(renderPlainCatalog(catalog, capabilities));
        for (const diagnostic of catalog.diagnostics) {
          process.stderr.write(`! ${diagnostic.message}\n`);
          if (diagnostic.hint !== undefined) process.stderr.write(`  ${diagnostic.hint}\n`);
        }
        for (const warning of catalog.packageManager?.warnings ?? []) {
          process.stderr.write(`! ${warning}\n`);
        }
      }
      return 0;
    }

    let scriptName = parsed.scriptName;
    let selectedWorkspace = parsed.workspace;
    let selectedSource = parsed.source;
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
      selectedSource = selection.command.source.kind;
    }

    if (scriptName === undefined) throw new Error("Command selection invariant failed.");
    const plan = createExecutionPlan(
      completeCatalog,
      scriptName,
      parsed.scriptArgs,
      selectedWorkspace,
      selectedSource,
    );
    if (parsed.dryRun) {
      process.stdout.write(
        parsed.json
          ? success("run", planForOutput(plan, process.cwd()), catalogWarnings(catalog))
          : renderPlan(plan),
      );
      return 0;
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

    if (parsed.json) {
      const controller = new AbortController();
      let interruptedExitCode: number | undefined;
      const interrupt = (): void => {
        interruptedExitCode = 130;
        controller.abort();
      };
      const terminate = (): void => {
        interruptedExitCode = 143;
        controller.abort();
      };
      process.once("SIGINT", interrupt);
      process.once("SIGTERM", terminate);
      try {
        const execution = await executeCaptured(plan, {
          maxOutputBytes: parsed.maxOutputBytes ?? 1_048_576,
          ...(parsed.timeoutMs === undefined ? {} : { timeoutMs: parsed.timeoutMs }),
          signal: controller.signal,
        });
        const ok = execution.exitCode === 0 && !execution.timedOut && !execution.aborted;
        process.stdout.write(
          executionResult(
            { plan: planForOutput(plan, process.cwd()), execution },
            ok,
            catalogWarnings(catalog),
          ),
        );
        if (execution.timedOut) return 124;
        return interruptedExitCode ?? execution.exitCode;
      } finally {
        process.removeListener("SIGINT", interrupt);
        process.removeListener("SIGTERM", terminate);
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
