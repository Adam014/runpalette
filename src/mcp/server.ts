import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import * as z from "zod/v4";
import { catalogForOutput } from "../core/catalog.js";
import { RunpaletteError } from "../core/errors.js";
import type { PackageManagerName } from "../core/model.js";
import { COMMAND_SOURCES } from "../core/model.js";
import { createExecutionPlan, planForOutput } from "../core/plan.js";
import { catalogWarnings, loadCatalog } from "../core/service.js";
import { packageVersion } from "../core/version.js";
import { executeCaptured } from "../process/capture.js";

interface McpOptions {
  cwd: string;
  config?: string;
  packageManager?: PackageManagerName;
  allowExecution: boolean;
  version: string;
}

const filters = {
  group: z.string().min(1).optional().describe("Only include this command group."),
  workspace: z.string().min(1).optional().describe("Only include this workspace."),
  source: z.enum(COMMAND_SOURCES).optional().describe("Only include this command source."),
};

function result(data: Record<string, unknown>) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data) }],
    structuredContent: data,
  };
}

function errorResult(error: unknown) {
  const payload =
    error instanceof RunpaletteError
      ? { code: error.code, message: error.message, hint: error.hint ?? null }
      : {
          code: "INTERNAL_ERROR",
          message: error instanceof Error ? error.message : String(error),
          hint: null,
        };
  return {
    content: [{ type: "text" as const, text: JSON.stringify({ ok: false, error: payload }) }],
    isError: true,
  };
}

async function catalogFor(
  options: McpOptions,
  input: {
    group?: string | undefined;
    workspace?: string | undefined;
    source?: (typeof COMMAND_SOURCES)[number] | undefined;
  },
): Promise<Awaited<ReturnType<typeof loadCatalog>>> {
  return await loadCatalog({
    cwd: options.cwd,
    ...(options.packageManager === undefined ? {} : { packageManager: options.packageManager }),
    ...(options.config === undefined ? {} : { config: options.config }),
    ...(input.group === undefined ? {} : { group: input.group }),
    ...(input.workspace === undefined ? {} : { workspace: input.workspace }),
    ...(input.source === undefined ? {} : { source: input.source }),
  });
}

export function createMcpServer(options: McpOptions): McpServer {
  const server = new McpServer(
    { name: "runpalette", version: options.version },
    {
      capabilities: { tools: {} },
      instructions:
        "Discover and plan commands already owned by the current project. Execution is unavailable unless the user explicitly starts Runpalette with --allow-execution.",
    },
  );

  server.registerTool(
    "list_commands",
    {
      title: "List project commands",
      description:
        "Return Runpalette's normalized, versioned command catalog with exact source and safety metadata.",
      inputSchema: z.object(filters),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (input) => {
      try {
        const { filtered } = await catalogFor(options, input);
        return result({
          schemaVersion: 1,
          ok: true,
          catalog: catalogForOutput(filtered, filtered.project.root),
          warnings: catalogWarnings(filtered),
        });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  const planInput = z.object({
    name: z.string().min(1).describe("Exact command name or configured alias."),
    args: z
      .array(z.string())
      .default([])
      .describe("Arguments forwarded without shell interpolation."),
    workspace: z.string().min(1).optional(),
    source: z.enum(COMMAND_SOURCES).optional(),
  });
  server.registerTool(
    "plan_command",
    {
      title: "Plan a project command",
      description:
        "Resolve one command to its exact executable, argument array, cwd, source, and safety policy without running it.",
      inputSchema: planInput,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ name, args, workspace, source }) => {
      try {
        const { complete } = await catalogFor(options, {});
        const plan = createExecutionPlan(complete, name, args, workspace, source);
        return result({
          schemaVersion: 1,
          ok: true,
          plan: planForOutput(plan, complete.project.root),
        });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  if (options.allowExecution) {
    server.registerTool(
      "run_command",
      {
        title: "Run a project command",
        description:
          "Run one exact project-owned command with bounded output and timeout. Protected commands require confirmed=true.",
        inputSchema: planInput.extend({
          confirmed: z.boolean().default(false),
          timeoutMs: z.number().int().min(1_000).max(120_000).default(30_000),
        }),
        annotations: {
          readOnlyHint: false,
          destructiveHint: true,
          idempotentHint: false,
          openWorldHint: true,
        },
      },
      async ({ name, args, workspace, source, confirmed, timeoutMs }) => {
        try {
          const { complete } = await catalogFor(options, {});
          const plan = createExecutionPlan(complete, name, args, workspace, source);
          if (plan.safety.confirmationRequired && !confirmed) {
            throw new RunpaletteError(
              "CONFIRMATION_REQUIRED",
              `Command ${JSON.stringify(plan.script.name)} requires explicit confirmation.`,
              "Review it with plan_command, then call run_command with confirmed=true.",
            );
          }
          const execution = await executeCaptured(plan, { timeoutMs, maxOutputBytes: 128 * 1024 });
          const payload = {
            schemaVersion: 1,
            ok: execution.exitCode === 0 && !execution.timedOut,
            plan: planForOutput(plan, complete.project.root),
            execution,
          };
          return execution.exitCode === 0 && !execution.timedOut
            ? result(payload)
            : { ...result(payload), isError: true };
        } catch (error) {
          return errorResult(error);
        }
      },
    );
  }

  return server;
}

export async function runMcpServer(options: Omit<McpOptions, "version">): Promise<void> {
  const version = await packageVersion();
  serveStdio(() => createMcpServer({ ...options, version }));
}
