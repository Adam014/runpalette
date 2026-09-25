import type { CommandCatalog, ExecutionPlan } from "../core/model.js";
import { sanitize } from "./style.js";

export function renderPlainCatalog(catalog: CommandCatalog): string {
  const lines = [
    `${sanitize(catalog.project.name)} · ${catalog.packageManager.name} · ${String(catalog.commands.length)} commands`,
  ];
  for (const group of catalog.groups) {
    lines.push("", group.label);
    const workspaceAware = catalog.project.workspaceCount > 0;
    const names = group.commands.map((command) =>
      workspaceAware ? `${command.workspace.name} · ${command.label}` : command.label,
    );
    const width = Math.min(28, Math.max(...names.map((name) => name.length), 1));
    for (const [index, command] of group.commands.entries()) {
      const name = names[index] ?? command.label;
      const confirmation = command.safety.confirmationRequired ? "  [confirm]" : "";
      lines.push(`  ${name.padEnd(width)}  ${sanitize(command.script)}${confirmation}`);
      if (command.description !== undefined)
        lines.push(`  ${"".padEnd(width)}  ${sanitize(command.description)}`);
    }
  }
  if (catalog.commands.length === 0) {
    lines.push("", "No runnable package scripts found.", "Add scripts to package.json.");
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
