import { describe, expect, test } from "bun:test";
import type { CommandCatalog } from "../../src/core/model.js";
import { openPalette, renderPalette } from "../../src/ui/palette.js";
import type { TerminalCapabilities } from "../../src/ui/terminal.js";

function catalog(): CommandCatalog {
  const dev = {
    id: "package:dev",
    name: "dev",
    label: "dev",
    aliases: [],
    script: "vite --host 0.0.0.0",
    group: "develop" as const,
    order: 0,
    safety: { confirmationRequired: false },
    workspace: { name: "app", path: ".", root: "/workspace/app", isRoot: true },
    source: { kind: "package.json" as const, path: "/workspace/app/package.json" },
  };
  const testUnit = {
    id: "package:test:unit",
    name: "test:unit",
    label: "test:unit",
    aliases: [],
    script: "vitest run",
    group: "quality" as const,
    order: 1,
    safety: { confirmationRequired: false },
    workspace: { name: "app", path: ".", root: "/workspace/app", isRoot: true },
    source: { kind: "package.json" as const, path: "/workspace/app/package.json" },
  };
  const commands = [dev, testUnit];
  return {
    schemaVersion: 1,
    project: {
      name: "app",
      root: "/workspace/app",
      manifestPath: "/workspace/app/package.json",
      workspaceCount: 0,
    },
    packageManager: {
      name: "pnpm",
      evidence: { source: "lockfile", detail: "pnpm-lock.yaml" },
      warnings: [],
    },
    groups: [
      { id: "develop", label: "Start & develop", commands: [dev] },
      { id: "quality", label: "Test & quality", commands: [testUnit] },
    ],
    commands,
    hidden: [],
  };
}

function manifestOrderDiffersFromVisualOrder(): CommandCatalog {
  const value = catalog();
  return { ...value, commands: [...value.commands].reverse() };
}

const terminal: TerminalCapabilities = {
  interactive: true,
  color: false,
  unicode: true,
  columns: 80,
  rows: 24,
};

class FakeInput {
  isRaw = false;
  resumed = false;
  paused = false;
  rawChanges: boolean[] = [];
  listeners = new Set<(chunk: Uint8Array | string) => void>();

  setRawMode(enabled: boolean): void {
    this.isRaw = enabled;
    this.rawChanges.push(enabled);
  }
  resume(): void {
    this.resumed = true;
  }
  pause(): void {
    this.paused = true;
  }
  on(_event: "data", listener: (chunk: Uint8Array | string) => void): void {
    this.listeners.add(listener);
  }
  off(_event: "data", listener: (chunk: Uint8Array | string) => void): void {
    this.listeners.delete(listener);
  }
  emit(value: string): void {
    for (const listener of this.listeners) listener(value);
  }
}

class Sink {
  text = "";
  write(value: string): void {
    this.text += value;
  }
}

describe("renderPalette", () => {
  test("shows hierarchy, selected command, exact action, and implementation", () => {
    const rendered = renderPalette(
      catalog(),
      { query: "", selected: 0, help: false, groupIndex: 0 },
      terminal,
    );

    expect(rendered).toContain("RUNPALETTE project commands, made visible");
    expect(rendered).toContain("START & DEVELOP");
    expect(rendered).toContain("◆ dev");
    expect(rendered).toContain("RUN   pnpm run dev");
    expect(rendered).toContain("DOES  vite --host 0.0.0.0");
  });

  test("selects the first visible command rather than the first manifest entry", () => {
    const rendered = renderPalette(
      manifestOrderDiffersFromVisualOrder(),
      { query: "", selected: 0, help: false, groupIndex: 0 },
      terminal,
    );

    expect(rendered).toContain("◆ dev");
    expect(rendered).toContain("RUN   pnpm run dev");
  });

  test("fits every visible line inside a very narrow terminal", () => {
    const rendered = renderPalette(
      catalog(),
      { query: "", selected: 0, help: false, groupIndex: 0 },
      { ...terminal, unicode: false, columns: 24, rows: 12 },
    );
    const cleaned = rendered.replaceAll("\u001B[K", "");

    expect(Math.max(...cleaned.split("\n").map((line) => [...line].length))).toBeLessThanOrEqual(
      23,
    );
    expect(cleaned).not.toContain("╭");
  });

  test("renders a useful empty search state", () => {
    const rendered = renderPalette(
      catalog(),
      { query: "nothing", selected: 0, help: false, groupIndex: 0 },
      terminal,
    );

    expect(rendered).toContain("No commands match this search.");
    expect(rendered).toContain("Esc clears it");
  });

  test("renders help, workspace context, descriptions, safety, and warnings", () => {
    const value = catalog();
    value.project.workspaceCount = 1;
    const defaultCommand = value.commands[1];
    const command = value.commands[0];
    if (defaultCommand === undefined || command === undefined) {
      throw new Error("Expected palette fixture commands");
    }
    value.defaultCommandId = defaultCommand.id;
    value.packageManager.warnings = ["Multiple lockfiles detected"];
    command.label = "Start web";
    command.description = "Open the frontend";
    command.workspace = {
      name: "@acme/web",
      path: "packages/web",
      root: "/workspace/app/packages/web",
      isRoot: false,
    };
    command.safety = { confirmationRequired: true };

    const details = renderPalette(
      value,
      { query: "", selected: 0, help: false, groupIndex: 0 },
      { ...terminal, color: true },
    );
    const help = renderPalette(
      value,
      { query: "", selected: 0, help: true, groupIndex: 0 },
      terminal,
    );

    expect(details).toContain("Start web");
    expect(details).toContain("Open the frontend");
    expect(details).toContain("Confirmation required");
    expect(details).toContain("Multiple lockfiles detected");
    expect(help).toContain("KEYBOARD");
    expect(help).toContain("Shift-Tab");
  });
});

describe("openPalette", () => {
  test("filters by typing and returns the selected command", async () => {
    const input = new FakeInput();
    const output = new Sink();
    const result = openPalette({ catalog: catalog(), input, output, capabilities: terminal });

    input.emit("unit\r");

    const selection = await result;
    expect(selection.kind).toBe("selected");
    if (selection.kind !== "selected") throw new Error("Expected a selected command");
    expect(selection.command.name).toBe("test:unit");
    expect(input.rawChanges).toEqual([true, false]);
    expect(input.paused).toBe(true);
    expect(output.text).toStartWith("\u001B[?1049h\u001B[?25l");
    expect(output.text).toEndWith("\u001B[?25h\u001B[?1049l");
  });

  test("Enter selects the first command shown in the grouped palette", async () => {
    const input = new FakeInput();
    const output = new Sink();
    const result = openPalette({
      catalog: manifestOrderDiffersFromVisualOrder(),
      input,
      output,
      capabilities: terminal,
    });

    input.emit("\r");

    const selection = await result;
    expect(selection.kind).toBe("selected");
    if (selection.kind !== "selected") throw new Error("Expected a selected command");
    expect(selection.command.name).toBe("dev");
  });

  test("supports arrows and restores the terminal after Ctrl-C", async () => {
    const input = new FakeInput();
    const output = new Sink();
    const result = openPalette({ catalog: catalog(), input, output, capabilities: terminal });

    input.emit("\u001B[B\u0003");

    expect(await result).toEqual({ kind: "cancelled", reason: "interrupt" });
    expect(input.listeners.size).toBe(0);
    expect(input.rawChanges).toEqual([true, false]);
  });

  test("first Escape clears search and second Escape closes", async () => {
    const input = new FakeInput();
    const output = new Sink();
    const result = openPalette({ catalog: catalog(), input, output, capabilities: terminal });

    input.emit("dev");
    input.emit("\u001b");
    await Bun.sleep(35);
    expect(input.listeners.size).toBe(1);
    input.emit("\u001b");

    expect(await result).toEqual({ kind: "cancelled", reason: "escape" });
  });

  test("cycles group filters with Tab", async () => {
    const input = new FakeInput();
    const output = new Sink();
    const result = openPalette({ catalog: catalog(), input, output, capabilities: terminal });

    input.emit("\t\r");
    const selection = await result;

    expect(selection.kind).toBe("selected");
    if (selection.kind !== "selected") throw new Error("Expected a selected command");
    expect(selection.command.name).toBe("dev");
    expect(output.text).toContain("Start & develop");
  });

  test("supports reverse filters, keyboard help, editing, and control navigation", async () => {
    const input = new FakeInput();
    const output = new Sink();
    const result = openPalette({ catalog: catalog(), input, output, capabilities: terminal });

    input.emit("?");
    input.emit("\r");
    input.emit("devx\u007f");
    input.emit("\u0015");
    input.emit("\u0010\u000e");
    input.emit("\u001B[Z");
    input.emit("\r");

    const selection = await result;
    expect(selection.kind).toBe("selected");
    expect(output.text).toContain("KEYBOARD");
  });

  test("returns unavailable without a usable interactive terminal or command", async () => {
    const input = new FakeInput();
    const output = new Sink();
    expect(
      await openPalette({
        catalog: catalog(),
        input,
        output,
        capabilities: { ...terminal, interactive: false },
      }),
    ).toEqual({ kind: "unavailable" });

    const empty = catalog();
    empty.commands = [];
    expect(await openPalette({ catalog: empty, input, output, capabilities: terminal })).toEqual({
      kind: "unavailable",
    });
  });

  test("restores terminal state when setup fails", async () => {
    const input = new FakeInput();
    input.setRawMode = () => {
      throw new Error("raw mode failed");
    };
    const output = new Sink();

    expect(
      await openPalette({ catalog: catalog(), input, output, capabilities: terminal }),
    ).toEqual({ kind: "unavailable" });
    expect(input.paused).toBe(true);
  });
});
