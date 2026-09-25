import { describe, expect, test } from "bun:test";
import { terminalCapabilities } from "../../src/ui/terminal.js";

describe("terminalCapabilities", () => {
  test("enables interactive color only for a usable pair of TTY streams", () => {
    const capabilities = terminalCapabilities({
      input: { isTTY: true },
      output: { isTTY: true, columns: 120, rows: 40 },
      environment: { TERM: "xterm-256color", LANG: "en_US.UTF-8" },
      nonInteractive: false,
      color: "auto",
      unicode: "auto",
    });

    expect(capabilities).toEqual({
      interactive: true,
      color: true,
      unicode: true,
      columns: 120,
      rows: 40,
    });
  });

  test("honors automation and accessibility overrides", () => {
    const capabilities = terminalCapabilities({
      input: { isTTY: true },
      output: { isTTY: true, columns: 1, rows: 1 },
      environment: { TERM: "dumb", NO_COLOR: "1", LANG: "C" },
      nonInteractive: false,
      color: "always",
      unicode: "never",
    });

    expect(capabilities).toEqual({
      interactive: false,
      color: true,
      unicode: false,
      columns: 20,
      rows: 10,
    });
  });
});
