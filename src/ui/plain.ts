import type { CommandCatalog, ExecutionPlan } from "../core/model.js";
import { sanitize } from "./style.js";

export function renderPlainCatalog(catalog: CommandCatalog): string {
  const lines = [
    `${sanitize(catalog.project.name)} · ${catalog.packageManager.name} · ${String(catalog.commands.length)} commands`,
  ];
  for (const group of catalog.groups) {
    lines.push("", group.label);
    const width = Math.min(
      28,
      Math.max(...group.commands.map((command) => command.name.length), 1),
    );
    for (const command of group.commands) {
      lines.push(`  ${command.name.padEnd(width)}  ${sanitize(command.script)}`);
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
