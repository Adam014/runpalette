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

export function renderPlan(plan: ExecutionPlan): string {
  return `$ ${[plan.executable, ...plan.args].map(shellDisplay).join(" ")}\n`;
}

function shellDisplay(value: string): string {
  const clean = sanitize(value);
  return /^[a-zA-Z0-9_./:@=-]+$/u.test(clean) ? clean : JSON.stringify(clean);
}
