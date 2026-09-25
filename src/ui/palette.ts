import type { CatalogCommand, CommandCatalog } from "../core/model.js";
import { filterCommands } from "./search.js";
import { pad, sanitize, style, truncate } from "./style.js";
import type { TerminalCapabilities } from "./terminal.js";

interface PaletteInput {
  isRaw?: boolean;
  setRawMode?(enabled: boolean): unknown;
  resume(): unknown;
  pause(): unknown;
  on(event: "data", listener: (chunk: Uint8Array | string) => void): unknown;
  off(event: "data", listener: (chunk: Uint8Array | string) => void): unknown;
}

interface TextSink {
  write(text: string): unknown;
}

export type PaletteResult =
  | { kind: "selected"; command: CatalogCommand }
  | { kind: "cancelled"; reason: "escape" | "interrupt" }
  | { kind: "unavailable" };

interface PaletteOptions {
  catalog: CommandCatalog;
  input: PaletteInput;
  output: TextSink;
  capabilities: TerminalCapabilities;
}

export interface PaletteState {
  query: string;
  selected: number;
  help: boolean;
  groupIndex: number;
}

function frameLine(content: string, width: number, capabilities: TerminalCapabilities): string {
  const vertical = capabilities.unicode ? "│" : "|";
  const innerWidth = Math.max(1, width - 4);
  return `${vertical} ${pad(truncate(content, innerWidth), innerWidth)} ${vertical}`;
}

function horizontal(width: number, capabilities: TerminalCapabilities, top: boolean): string {
  const left = capabilities.unicode ? (top ? "╭" : "╰") : "+";
  const right = capabilities.unicode ? (top ? "╮" : "╯") : "+";
  const rule = capabilities.unicode ? "─" : "-";
  return `${left}${rule.repeat(Math.max(1, width - 2))}${right}`;
}

function groupedRows(
  catalog: CommandCatalog,
  commands: readonly CatalogCommand[],
): Array<{ kind: "heading"; label: string } | { kind: "command"; command: CatalogCommand }> {
  const rows: Array<
    { kind: "heading"; label: string } | { kind: "command"; command: CatalogCommand }
  > = [];
  for (const group of catalog.groups) {
    const matching = commands.filter((command) => command.group === group.id);
    if (matching.length === 0) continue;
    rows.push({ kind: "heading", label: group.label.toUpperCase() });
    rows.push(...matching.map((command) => ({ kind: "command" as const, command })));
  }
  return rows;
}

function paletteCommands(catalog: CommandCatalog, groupIndex = 0): CatalogCommand[] {
  if (groupIndex === 0) return catalog.groups.flatMap((group) => group.commands);
  return catalog.groups[groupIndex - 1]?.commands ?? [];
}

function visibleRows(
  catalog: CommandCatalog,
  commands: readonly CatalogCommand[],
  selectedCommand: CatalogCommand | undefined,
  maximum: number,
): ReturnType<typeof groupedRows> {
  const rows = groupedRows(catalog, commands);
  if (rows.length <= maximum) return rows;
  const selectedRow = rows.findIndex(
    (row) => row.kind === "command" && row.command.id === selectedCommand?.id,
  );
  const start = Math.max(0, Math.min(selectedRow - Math.floor(maximum / 2), rows.length - maximum));
  const window = rows.slice(start, start + maximum);
  if (start > 0 && window[0]?.kind === "heading") window.shift();
  return window;
}

export function renderPalette(
  catalog: CommandCatalog,
  state: PaletteState,
  capabilities: TerminalCapabilities,
): string {
  const width = Math.max(20, Math.min(capabilities.columns - 1, 96));
  const compact = width < 58 || capabilities.rows < 18;
  const commands = filterCommands(paletteCommands(catalog, state.groupIndex), state.query);
  const selectedIndex = Math.min(state.selected, Math.max(0, commands.length - 1));
  const selected = commands[selectedIndex];
  const lines: string[] = [];

  lines.push(style.accent(horizontal(width, capabilities, true), capabilities));
  lines.push(
    style.strong(
      frameLine("RUNPALETTE  project commands, made visible", width, capabilities),
      capabilities,
    ),
  );
  lines.push(
    frameLine(
      `${catalog.project.name}  ·  ${catalog.packageManager.name}  ·  ${String(catalog.commands.length)} commands`,
      width,
      capabilities,
    ),
  );
  if (!compact) {
    lines.push(style.dim(frameLine(catalog.project.root, width, capabilities), capabilities));
  }
  lines.push(style.accent(horizontal(width, capabilities, false), capabilities));

  const searchLabel = state.query === "" ? "Type to search commands" : state.query;
  lines.push("");
  lines.push(
    ` ${style.accent(capabilities.unicode ? "⌕" : "/", capabilities)}  ${
      state.query === ""
        ? style.dim(truncate(searchLabel, width - 4), capabilities)
        : style.strong(truncate(searchLabel, width - 4), capabilities)
    }`,
  );
  const selectedGroup = state.groupIndex === 0 ? undefined : catalog.groups[state.groupIndex - 1];
  lines.push(
    ` ${style.dim("VIEW", capabilities)}  ${style.accent(
      truncate(`${selectedGroup?.label ?? "All commands"} · Tab change`, width - 8),
      capabilities,
    )}`,
  );
  lines.push("");

  if (state.help) {
    lines.push(style.strong(" KEYBOARD", capabilities));
    for (const instruction of [
      "↑/↓ or Ctrl-N/Ctrl-P   move selection",
      "type                   filter immediately",
      "Tab / Shift-Tab        change group filter",
      "Backspace / Ctrl-U     edit / clear search",
      "Enter                  run selected command",
      "Esc                    clear search, then close",
      "?                      close this help",
    ]) {
      lines.push(` ${truncate(instruction, width - 1)}`);
    }
  } else if (commands.length === 0) {
    lines.push(
      style.warning(` ${truncate("No commands match this search.", width - 1)}`, capabilities),
    );
    lines.push(
      style.dim(
        ` ${truncate("Backspace edits the query · Esc clears it", width - 1)}`,
        capabilities,
      ),
    );
  } else {
    const reservedRows = compact ? 12 : 16;
    const maximumRows = Math.max(3, capabilities.rows - reservedRows);
    for (const row of visibleRows(catalog, commands, selected, maximumRows)) {
      if (row.kind === "heading") {
        lines.push(` ${style.dim(row.label, capabilities)}`);
        continue;
      }
      const active = row.command.id === selected?.id;
      const pointer = active ? style.accent(capabilities.unicode ? "◆" : ">", capabilities) : " ";
      const workspace =
        catalog.project.workspaceCount > 0 ? `  ·  ${row.command.workspace.name}` : "";
      const confirmation = row.command.safety.confirmationRequired ? "  !" : "";
      const content = truncate(`${row.command.label}${workspace}${confirmation}`, width - 7);
      const rendered = active
        ? style.selected(` ${pad(content, Math.max(1, width - 7))} `, capabilities)
        : ` ${content}`;
      lines.push(` ${pointer}${rendered}`);
    }
  }

  const selectedScript = selected === undefined ? "No command selected" : selected.script;
  const delegated =
    selected === undefined ? "" : `${catalog.packageManager.name} run ${selected.name}`;
  lines.push("");
  lines.push(` ${style.dim("RUN", capabilities)}   ${truncate(delegated, width - 8)}`);
  if (!compact) {
    lines.push(` ${style.dim("DOES", capabilities)}  ${truncate(selectedScript, width - 8)}`);
    if (selected?.description !== undefined) {
      lines.push(
        ` ${style.dim("ABOUT", capabilities)} ${truncate(selected.description, width - 8)}`,
      );
    }
    if (selected !== undefined && catalog.project.workspaceCount > 0) {
      lines.push(
        ` ${style.dim("IN", capabilities)}    ${truncate(selected.workspace.name, width - 8)}`,
      );
    }
  }
  if (selected?.safety.confirmationRequired === true) {
    lines.push(
      ` ${style.warning("!", capabilities)} ${truncate("Confirmation required before execution", width - 4)}`,
    );
  }
  const warning = catalog.packageManager.warnings[0];
  if (warning !== undefined) {
    lines.push(` ${style.warning("!", capabilities)} ${truncate(warning, width - 4)}`);
  }
  lines.push("");
  const footer = compact
    ? "↑↓ · type · tab · enter · esc"
    : "↑↓ move · type search · tab filter · enter run · ? help · esc close";
  lines.push(` ${style.dim(truncate(footer, width - 1), capabilities)}`);

  return lines.map((line) => `${line}\u001B[K`).join("\n");
}

export async function openPalette(options: PaletteOptions): Promise<PaletteResult> {
  if (!options.capabilities.interactive || options.input.setRawMode === undefined) {
    return { kind: "unavailable" };
  }
  if (options.catalog.commands.length === 0) return { kind: "unavailable" };

  return await new Promise<PaletteResult>((resolve) => {
    const visualCommands = paletteCommands(options.catalog);
    const defaultIndex = visualCommands.findIndex(
      (command) => command.id === options.catalog.defaultCommandId,
    );
    const state: PaletteState = {
      query: "",
      selected: defaultIndex === -1 ? 0 : defaultIndex,
      help: false,
      groupIndex: 0,
    };
    const wasRaw = options.input.isRaw === true;
    let settled = false;
    let buffered = "";
    let escapeTimer: ReturnType<typeof setTimeout> | undefined;

    const attempt = (operation: () => unknown) => {
      try {
        operation();
      } catch {
        // Every terminal restoration step is independent and best-effort.
      }
    };
    const draw = () => {
      options.output.write(
        `\u001B[H\u001B[2J${renderPalette(options.catalog, state, options.capabilities)}`,
      );
    };
    const cleanup = () => {
      if (escapeTimer !== undefined) clearTimeout(escapeTimer);
      attempt(() => options.input.off("data", onData));
      if (!wasRaw) attempt(() => options.input.setRawMode?.(false));
      attempt(() => options.input.pause());
      attempt(() => options.output.write("\u001B[?25h\u001B[?1049l"));
    };
    const settle = (result: PaletteResult) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(result);
    };
    const matches = () =>
      filterCommands(paletteCommands(options.catalog, state.groupIndex), state.query);
    const move = (direction: -1 | 1) => {
      const length = matches().length;
      if (length === 0) return;
      state.selected = (state.selected + direction + length) % length;
      draw();
    };
    const changeGroup = (direction: -1 | 1) => {
      const length = options.catalog.groups.length + 1;
      state.groupIndex = (state.groupIndex + direction + length) % length;
      state.selected = 0;
      state.help = false;
      draw();
    };
    const clearOrClose = () => {
      if (state.help) {
        state.help = false;
        draw();
      } else if (state.query !== "") {
        state.query = "";
        state.selected = 0;
        draw();
      } else {
        settle({ kind: "cancelled", reason: "escape" });
      }
    };
    const processInput = () => {
      while (!settled && buffered !== "") {
        if (buffered.startsWith("\u001B[Z")) {
          buffered = buffered.slice(3);
          changeGroup(-1);
          continue;
        }
        if (buffered.startsWith("\u001B[A")) {
          buffered = buffered.slice(3);
          move(-1);
          continue;
        }
        if (buffered.startsWith("\u001B[B")) {
          buffered = buffered.slice(3);
          move(1);
          continue;
        }
        const character = buffered[0];
        if (character === undefined) return;
        buffered = buffered.slice(1);
        if (character === "\u0003") {
          settle({ kind: "cancelled", reason: "interrupt" });
          return;
        }
        if (character === "\u000e") {
          move(1);
          continue;
        }
        if (character === "\u0010") {
          move(-1);
          continue;
        }
        if (character === "\t") {
          changeGroup(1);
          continue;
        }
        if (character === "\u0015") {
          state.query = "";
          state.selected = 0;
          state.help = false;
          draw();
          continue;
        }
        if (character === "\u007f" || character === "\b") {
          state.query = [...state.query].slice(0, -1).join("");
          state.selected = 0;
          state.help = false;
          draw();
          continue;
        }
        if (character === "\r" || character === "\n") {
          if (state.help) {
            state.help = false;
            draw();
            continue;
          }
          const selected = matches()[state.selected];
          if (selected !== undefined) settle({ kind: "selected", command: selected });
          return;
        }
        if (character === "\u001b") {
          if (buffered === "") {
            escapeTimer = setTimeout(clearOrClose, 25);
            return;
          }
          clearOrClose();
          continue;
        }
        if (character === "?" && state.query === "") {
          state.help = !state.help;
          draw();
          continue;
        }
        if (!state.help && /^\P{C}$/u.test(character)) {
          state.query += sanitize(character);
          state.selected = 0;
          draw();
        }
      }
    };
    const onData = (chunk: Uint8Array | string) => {
      if (escapeTimer !== undefined) {
        clearTimeout(escapeTimer);
        escapeTimer = undefined;
      }
      buffered += typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk);
      processInput();
    };

    try {
      options.output.write("\u001B[?1049h\u001B[?25l");
      options.input.setRawMode?.(true);
      options.input.resume();
      options.input.on("data", onData);
      draw();
    } catch {
      settle({ kind: "unavailable" });
    }
  });
}
