import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import * as z from "zod/v4";
import { catalogForOutput } from "../core/catalog.js";
import { createConfigValidationReport } from "../core/config.js";
import { createDoctorReport, doctorReportForOutput } from "../core/doctor.js";
import { RunpaletteError } from "../core/errors.js";
import type { PackageManagerName } from "../core/model.js";
import { COMMAND_SOURCES } from "../core/model.js";
import { createExecutionPlan, planForOutput } from "../core/plan.js";
import { assertPlanReady } from "../core/requirements.js";
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

const checkProjectOutput = z.object({
  schemaVersion: z.literal(1),
  ok: z.boolean(),
  status: z.enum(["ready", "warning", "error"]),
  doctor: z.object({
    schemaVersion: z.literal(1),
    status: z.enum(["ready", "warning", "error"]),
    project: z.object({
      name: z.string(),
      root: z.string(),
      manifestPath: z.string().optional(),
      workspaceCount: z.number().int().nonnegative(),
    }),
    packageManager: z
      .object({
        name: z.enum(["npm", "pnpm", "yarn", "bun"]),
        evidence: z.object({ source: z.string(), detail: z.string() }),
        warnings: z.array(z.string()),
      })
      .optional(),
    configuration: z.object({
      mode: z.enum(["zero-config", "file"]),
      path: z.string().optional(),
    }),
    summary: z.object({
      commands: z.number().int().nonnegative(),
      workspaces: z.number().int().nonnegative(),
      hidden: z.number().int().nonnegative(),
      protected: z.number().int().nonnegative(),
      ambiguousNames: z.number().int().nonnegative(),
      unavailable: z.number().int().nonnegative(),
    }),
    sources: z.array(
      z.object({ kind: z.enum(COMMAND_SOURCES), commands: z.number().int().nonnegative() }),
    ),
    checks: z.array(
      z.object({
        id: z.string(),
        status: z.enum(["pass", "warning", "fail"]),
        label: z.string(),
        detail: z.string(),
        hint: z.string().optional(),
      }),
    ),
  }),
  configuration: z
    .object({
      schemaVersion: z.literal(1),
      status: z.enum(["valid", "warning"]),
      path: z.string(),
      configured: z.object({
        commands: z.number().int().nonnegative(),
        groups: z.number().int().nonnegative(),
        default: z.boolean(),
      }),
      discovered: z.object({
        runnableCommands: z.number().int().nonnegative(),
        workspaces: z.number().int().nonnegative(),
      }),
      unmatchedSelectors: z.array(z.string()),
    })
    .nullable(),
  warnings: z.array(z.string()),
});

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
        "Check project readiness first, then discover and plan commands already owned by the project. Execution is unavailable unless the user explicitly starts Runpalette with --allow-execution.",
    },
  );

  server.registerTool(
    "check_project",
    {
      title: "Check project readiness",
      description:
        "Validate Runpalette project discovery, command sources, package-manager readiness, and optional configuration before planning work.",
      inputSchema: z.object({}),
      outputSchema: checkProjectOutput,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async () => {
      try {
        const loaded = await catalogFor(options, {});
        const doctor = doctorReportForOutput(
          createDoctorReport(loaded.complete, loaded.config),
          loaded.complete.project.root,
        );
        const configuration =
          loaded.config.path === undefined
            ? null
            : createConfigValidationReport(
                loaded.config,
                loaded.complete,
                loaded.complete.project.root,
                loaded.configurationSelectors,
              );
        const status =
          doctor.status === "error"
            ? "error"
            : doctor.status === "warning" || configuration?.status === "warning"
              ? "warning"
              : "ready";
        return result({
          schemaVersion: 1,
          ok: status !== "error",
          status,
          doctor,
          configuration,
          warnings: catalogWarnings(loaded.complete),
        });
      } catch (error) {
        return errorResult(error);
      }
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
      async ({ name, args, workspace, source, confirmed, timeoutMs }, context) => {
        try {
          const { complete } = await catalogFor(options, {});
          const plan = createExecutionPlan(complete, name, args, workspace, source);
          assertPlanReady(plan);
          if (plan.safety.confirmationRequired && !confirmed) {
            throw new RunpaletteError(
              "CONFIRMATION_REQUIRED",
              `Command ${JSON.stringify(plan.script.name)} requires explicit confirmation.`,
              "Review it with plan_command, then call run_command with confirmed=true.",
            );
          }
          const execution = await executeCaptured(plan, {
            timeoutMs,
            maxOutputBytes: 128 * 1024,
            signal: context.mcpReq.signal,
          });
          const payload = {
            schemaVersion: 1,
            ok: execution.exitCode === 0 && !execution.timedOut && !execution.aborted,
            plan: planForOutput(plan, complete.project.root),
            execution,
          };
          return execution.exitCode === 0 && !execution.timedOut && !execution.aborted
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
