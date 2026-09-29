import * as z from "zod/v4";
import { COMMAND_SOURCES, PACKAGE_MANAGERS } from "../core/model.js";

const source = z.object({ kind: z.enum(COMMAND_SOURCES), path: z.string() });
const workspace = z.object({
  name: z.string(),
  path: z.string(),
  root: z.string(),
  isRoot: z.boolean(),
});
const safety = z.object({
  confirmationRequired: z.boolean(),
  message: z.string().optional(),
});
const requirements = z.object({
  environment: z.array(z.string()),
  executables: z.array(z.string()),
});
const readiness = z.object({
  ready: z.boolean(),
  missingEnvironment: z.array(z.string()),
  missingExecutables: z.array(z.string()),
});
const packageManager = z.object({
  name: z.enum(PACKAGE_MANAGERS),
  evidence: z.object({
    source: z.enum(["explicit", "packageManager", "lockfile", "fallback"]),
    detail: z.string(),
  }),
  warnings: z.array(z.string()),
});
const project = z.object({
  name: z.string(),
  root: z.string(),
  manifestPath: z.string().optional(),
  workspaceCount: z.number().int().nonnegative(),
});
const sourceDiagnostic = z.object({
  source: z.enum(COMMAND_SOURCES),
  level: z.enum(["warning", "error"]),
  message: z.string(),
  hint: z.string().optional(),
});
const catalogCommand = z.object({
  id: z.string(),
  name: z.string(),
  label: z.string(),
  description: z.string().optional(),
  aliases: z.array(z.string()),
  script: z.string(),
  group: z.string(),
  order: z.number(),
  safety,
  requirements,
  workspace,
  source,
  execution: z.object({
    executable: z.string(),
    args: z.array(z.string()),
    forwardedArgsSeparator: z.string().optional(),
  }),
});
const catalog = z.object({
  schemaVersion: z.literal(1),
  project,
  packageManager: packageManager.optional(),
  sources: z.array(z.enum(COMMAND_SOURCES)),
  diagnostics: z.array(sourceDiagnostic),
  groups: z.array(
    z.object({ id: z.string(), label: z.string(), commands: z.array(catalogCommand) }),
  ),
  commands: z.array(catalogCommand),
  hidden: z.array(
    z.object({
      name: z.string(),
      workspace: z.string(),
      reason: z.enum(["lifecycle", "self", "config"]),
    }),
  ),
  defaultCommandId: z.string().optional(),
});
const plan = z.object({
  schemaVersion: z.literal(1),
  command: z.literal("run"),
  script: z.object({ name: z.string(), value: z.string(), requestedAs: z.string() }),
  workspace,
  safety,
  requirements,
  readiness,
  source,
  packageManager: z.enum(PACKAGE_MANAGERS).optional(),
  executable: z.string(),
  args: z.array(z.string()),
  cwd: z.string(),
});
const execution = z.object({
  startedAt: z.string(),
  finishedAt: z.string(),
  durationMs: z.number().nonnegative(),
  exitCode: z.number().int(),
  signal: z.string().nullable(),
  stdout: z.string(),
  stderr: z.string(),
  stdoutBytes: z.number().int().nonnegative(),
  stderrBytes: z.number().int().nonnegative(),
  capturedBytes: z.number().int().nonnegative(),
  maxOutputBytes: z.number().int().positive(),
  timedOut: z.boolean(),
  aborted: z.boolean(),
  truncated: z.boolean(),
  stdoutTruncated: z.boolean(),
  stderrTruncated: z.boolean(),
});

export const checkProjectOutput = z.object({
  schemaVersion: z.literal(1),
  ok: z.boolean(),
  status: z.enum(["ready", "warning", "error"]),
  doctor: z.object({
    schemaVersion: z.literal(1),
    status: z.enum(["ready", "warning", "error"]),
    project,
    packageManager: packageManager.optional(),
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

export const listCommandsOutput = z.object({
  schemaVersion: z.literal(1),
  ok: z.literal(true),
  catalog,
  warnings: z.array(z.string()),
});

export const planCommandOutput = z.object({
  schemaVersion: z.literal(1),
  ok: z.literal(true),
  plan,
});

export const runCommandOutput = z.object({
  schemaVersion: z.literal(1),
  ok: z.boolean(),
  plan,
  execution,
});
