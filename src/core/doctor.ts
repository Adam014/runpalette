import { relative } from "node:path";
import { executableAvailable } from "../process/executable.js";
import type { RunpaletteConfig } from "./config.js";
import type { CommandCatalog, CommandSourceKind } from "./model.js";

export type DoctorCheckStatus = "pass" | "warning" | "fail";

export interface DoctorCheck {
  id: string;
  status: DoctorCheckStatus;
  label: string;
  detail: string;
  hint?: string;
}

export interface DoctorReport {
  schemaVersion: 1;
  status: "ready" | "warning" | "error";
  project: CommandCatalog["project"];
  packageManager?: CommandCatalog["packageManager"];
  configuration: {
    mode: "zero-config" | "file";
    path?: string;
  };
  summary: {
    commands: number;
    workspaces: number;
    hidden: number;
    protected: number;
    ambiguousNames: number;
  };
  sources: Array<{ kind: CommandSourceKind; commands: number }>;
  checks: DoctorCheck[];
}

function overallStatus(checks: readonly DoctorCheck[]): DoctorReport["status"] {
  if (checks.some((check) => check.status === "fail")) return "error";
  if (checks.some((check) => check.status === "warning")) return "warning";
  return "ready";
}

export function createDoctorReport(
  catalog: CommandCatalog,
  config: RunpaletteConfig,
): DoctorReport {
  const checks: DoctorCheck[] = [
    {
      id: "project",
      status: "pass",
      label: "Project",
      detail: `${catalog.project.name} at ${catalog.project.root}`,
    },
  ];

  if (catalog.commands.length === 0) {
    checks.push({
      id: "commands",
      status: "fail",
      label: "Commands",
      detail: "No runnable project commands were discovered.",
      hint: "Add a command to a supported source or fix the source diagnostics below.",
    });
  } else {
    checks.push({
      id: "commands",
      status: "pass",
      label: "Commands",
      detail: `${String(catalog.commands.length)} runnable command${catalog.commands.length === 1 ? "" : "s"} discovered.`,
    });
  }

  if (catalog.packageManager !== undefined) {
    const available = executableAvailable(catalog.packageManager.name);
    checks.push({
      id: "package-manager",
      status: available ? "pass" : "fail",
      label: "Package manager",
      detail: available
        ? `${catalog.packageManager.name} is available (${catalog.packageManager.evidence.source}: ${catalog.packageManager.evidence.detail}).`
        : `${catalog.packageManager.name} was selected but is not available on PATH.`,
      ...(available
        ? {}
        : {
            hint: `Install ${catalog.packageManager.name} or select another manager with --package-manager.`,
          }),
    });
  }

  checks.push({
    id: "configuration",
    status: "pass",
    label: "Configuration",
    detail:
      config.path === undefined
        ? "Zero-config discovery is active."
        : `Loaded and validated ${config.path}.`,
  });

  for (const warning of catalog.packageManager?.warnings ?? []) {
    checks.push({
      id: "package-manager-metadata",
      status: "warning",
      label: "Package manager metadata",
      detail: warning,
      hint: "Declare packageManager or keep only the intended lockfile.",
    });
  }
  for (const diagnostic of catalog.diagnostics) {
    checks.push({
      id: `source-${diagnostic.source}`,
      status: diagnostic.level === "error" ? "fail" : "warning",
      label: `${diagnostic.source} source`,
      detail: diagnostic.message,
      ...(diagnostic.hint === undefined ? {} : { hint: diagnostic.hint }),
    });
  }

  const counts = new Map<CommandSourceKind, number>();
  const names = new Map<string, number>();
  for (const command of catalog.commands) {
    counts.set(command.source.kind, (counts.get(command.source.kind) ?? 0) + 1);
    names.set(command.name, (names.get(command.name) ?? 0) + 1);
  }

  return {
    schemaVersion: 1,
    status: overallStatus(checks),
    project: catalog.project,
    ...(catalog.packageManager === undefined ? {} : { packageManager: catalog.packageManager }),
    configuration:
      config.path === undefined ? { mode: "zero-config" } : { mode: "file", path: config.path },
    summary: {
      commands: catalog.commands.length,
      workspaces: catalog.project.workspaceCount,
      hidden: catalog.hidden.length,
      protected: catalog.commands.filter((command) => command.safety.confirmationRequired).length,
      ambiguousNames: [...names.values()].filter((count) => count > 1).length,
    },
    sources: [...counts.entries()].map(([kind, commands]) => ({ kind, commands })),
    checks,
  };
}

export function doctorReportForOutput(report: DoctorReport, invocationCwd: string): DoctorReport {
  const projectRoot = relative(invocationCwd, report.project.root) || ".";
  const configPath =
    report.configuration.path === undefined
      ? undefined
      : relative(invocationCwd, report.configuration.path) || ".";
  return {
    ...report,
    project: {
      ...report.project,
      root: projectRoot,
      ...(report.project.manifestPath === undefined
        ? {}
        : { manifestPath: relative(invocationCwd, report.project.manifestPath) }),
    },
    configuration:
      configPath === undefined ? report.configuration : { mode: "file", path: configPath },
    checks: report.checks.map((check) => {
      if (check.id === "project")
        return { ...check, detail: `${report.project.name} at ${projectRoot}` };
      if (check.id === "configuration" && configPath !== undefined) {
        return { ...check, detail: `Loaded and validated ${configPath}.` };
      }
      return check;
    }),
  };
}
