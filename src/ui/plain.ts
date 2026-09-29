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

export function renderPlan(plan: ExecutionPlan): string {
  return `$ ${[plan.executable, ...plan.args].map(shellDisplay).join(" ")}\n`;
}

function shellDisplay(value: string): string {
  const clean = sanitize(value);
  return /^[a-zA-Z0-9_./:@=-]+$/u.test(clean) ? clean : JSON.stringify(clean);
}
