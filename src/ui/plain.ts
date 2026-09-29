import type { ConfigValidationReport } from "../core/config.js";
import type { DoctorReport } from "../core/doctor.js";
import type { CommandCatalog, ExecutionPlan } from "../core/model.js";
import { sanitize, style } from "./style.js";
import type { TerminalCapabilities } from "./terminal.js";

export function renderPlainCatalog(
  catalog: CommandCatalog,
  capabilities: TerminalCapabilities,
): string {
  const separator = capabilities.unicode ? " · " : " | ";
  const sourceLabel =
    [
      ...(catalog.packageManager === undefined ? [] : [catalog.packageManager.name]),
      ...catalog.sources.filter((source) => source !== "package"),
    ].join("+") || "no sources";
  const lines = [
    style.strong(
      `${sanitize(catalog.project.name)}${separator}${sourceLabel}${separator}${String(catalog.commands.length)} commands`,
      capabilities,
    ),
  ];
  for (const group of catalog.groups) {
    lines.push("", style.accent(group.label, capabilities));
    const workspaceAware = catalog.project.workspaceCount > 0;
    const sourceAware = catalog.sources.length > 1;
    const names = group.commands.map((command) =>
      [
        ...(sourceAware ? [command.source.kind] : []),
        ...(workspaceAware ? [command.workspace.name] : []),
        command.label,
      ].join(separator),
    );
    const width = Math.min(28, Math.max(...names.map((name) => name.length), 1));
    for (const [index, command] of group.commands.entries()) {
      const name = names[index] ?? command.label;
      const confirmation = command.safety.confirmationRequired
        ? style.warning("  [confirm]", capabilities)
        : "";
      lines.push(`  ${name.padEnd(width)}  ${sanitize(command.script)}${confirmation}`);
      if (command.description !== undefined)
        lines.push(
          style.dim(`  ${"".padEnd(width)}  ${sanitize(command.description)}`, capabilities),
        );
    }
  }
  if (catalog.commands.length === 0) {
    lines.push(
      "",
      "No runnable project commands found.",
      "Add commands to a supported project source.",
    );
  }
  return `${lines.join("\n")}\n`;
}

export function renderDoctorReport(
  report: DoctorReport,
  capabilities: TerminalCapabilities,
): string {
  const symbols = capabilities.unicode
    ? { pass: "✓", warning: "!", fail: "✕" }
    : { pass: "OK", warning: "!", fail: "X" };
  const statusStyle = {
    pass: style.accent,
    warning: style.warning,
    fail: style.failure,
  } as const;
  const lines = [style.strong("Runpalette doctor", capabilities), ""];
  for (const check of report.checks) {
    const marker = statusStyle[check.status](symbols[check.status], capabilities);
    lines.push(`${marker} ${style.strong(check.label, capabilities)}  ${sanitize(check.detail)}`);
    if (check.hint !== undefined) {
      lines.push(style.dim(`  ${sanitize(check.hint)}`, capabilities));
    }
  }
  const summary =
    report.status === "ready"
      ? "Ready"
      : report.status === "warning"
        ? "Ready with warnings"
        : "Not ready";
  const renderSummary =
    report.status === "ready"
      ? style.accent
      : report.status === "warning"
        ? style.warning
        : style.failure;
  const details = [
    `${String(report.summary.commands)} command${report.summary.commands === 1 ? "" : "s"}`,
    `${String(report.sources.length)} source${report.sources.length === 1 ? "" : "s"}`,
    ...(report.summary.workspaces === 0
      ? []
      : [
          `${String(report.summary.workspaces)} workspace${report.summary.workspaces === 1 ? "" : "s"}`,
        ]),
    ...(report.summary.protected === 0 ? [] : [`${String(report.summary.protected)} protected`]),
  ];
  lines.push("", `${renderSummary(summary, capabilities)} · ${details.join(" · ")}`);
  return `${lines.join("\n")}\n`;
}

export function renderConfigCreated(
  path: string,
  projectName: string,
  capabilities: TerminalCapabilities,
  explicitPath = false,
): string {
  const marker = capabilities.unicode ? "✓" : "OK";
  const validationCommand = explicitPath
    ? `runpalette config validate --config ${shellDisplay(path)}`
    : "runpalette config validate";
  return `${[
    style.strong("Runpalette configuration", capabilities),
    "",
    `${style.accent(marker, capabilities)} Created ${sanitize(path)} for ${sanitize(projectName)}.`,
    style.dim("  Existing project commands remain the source of truth.", capabilities),
    "",
    `Next  Edit labels, groups, aliases, or confirmations, then run:`,
    style.strong(`  ${validationCommand}`, capabilities),
  ].join("\n")}\n`;
}

export function renderConfigValidation(
  report: ConfigValidationReport,
  capabilities: TerminalCapabilities,
): string {
  const valid = report.status === "valid";
  const marker = capabilities.unicode ? (valid ? "✓" : "!") : valid ? "OK" : "!";
  const renderStatus = valid ? style.accent : style.warning;
  const lines = [
    style.strong("Runpalette configuration", capabilities),
    "",
    `${renderStatus(marker, capabilities)} ${valid ? "Valid" : "Valid with warnings"}  ${sanitize(report.path)}`,
    style.dim(
      `  ${String(report.configured.commands)} configured · ${String(report.discovered.runnableCommands)} runnable · ${String(report.discovered.workspaces)} workspace${report.discovered.workspaces === 1 ? "" : "s"}`,
      capabilities,
    ),
  ];
  if (!valid) {
    lines.push("", style.warning("Unmatched command selectors", capabilities));
    for (const selector of report.unmatchedSelectors) lines.push(`  ${sanitize(selector)}`);
    lines.push(
      style.dim(
        "  Remove stale selectors or add the corresponding project commands.",
        capabilities,
      ),
    );
  }
  return `${lines.join("\n")}\n`;
}

export function renderPlan(plan: ExecutionPlan): string {
  return `$ ${[plan.executable, ...plan.args].map(shellDisplay).join(" ")}\n`;
}

export function renderPlanDetails(plan: ExecutionPlan, capabilities: TerminalCapabilities): string {
  const separator = capabilities.unicode ? " · " : " | ";
  const requestedAs =
    plan.script.requestedAs === plan.script.name
      ? ""
      : `${separator}requested as ${sanitize(plan.script.requestedAs)}`;
  const safety = plan.safety.confirmationRequired
    ? [
        "confirmation required",
        ...(plan.safety.message === undefined ? [] : [sanitize(plan.safety.message)]),
      ].join(separator)
    : "no confirmation required";
  const rows = [
    ["Command", `${sanitize(plan.script.name)}${requestedAs}`],
    ["Source", `${sanitize(plan.source.kind)}${separator}${sanitize(plan.source.path)}`],
    ["Workspace", `${sanitize(plan.workspace.name)}${separator}${sanitize(plan.workspace.path)}`],
    ["Directory", sanitize(plan.cwd)],
    ["Safety", safety],
    ...(plan.packageManager === undefined
      ? []
      : [["Manager", sanitize(plan.packageManager)] as const]),
  ];
  const lines = [style.strong("Runpalette plan", capabilities), ""];
  for (const [label, value] of rows) {
    lines.push(`${style.dim(label.padEnd(10), capabilities)} ${value}`);
  }
  lines.push("", style.strong("Executes", capabilities), `  ${renderPlan(plan).trimEnd()}`);
  return `${lines.join("\n")}\n`;
}

function shellDisplay(value: string): string {
  const clean = sanitize(value);
  return /^[a-zA-Z0-9_./:@=-]+$/u.test(clean) ? clean : JSON.stringify(clean);
}
