import { describe, expect, test } from "bun:test";
import { parseArguments } from "../../src/cli/arguments.js";
import { RunpaletteError } from "../../src/core/errors.js";

describe("parseArguments", () => {
  test("parses a run command and preserves arguments after the separator", () => {
    expect(
      parseArguments(
        ["run", "test:unit", "--cwd", "./app", "--package-manager=pnpm", "--", "--watch", "a b"],
        "/workspace",
      ),
    ).toEqual({
      command: "run",
      cwd: "./app",
      packageManager: "pnpm",
      json: false,
      nonInteractive: false,
      dryRun: false,
      color: "auto",
      unicode: "auto",
      scriptName: "test:unit",
      scriptArgs: ["--watch", "a b"],
    });
  });

  test("makes JSON mode non-interactive regardless of argument order", () => {
    const parsed = parseArguments(["--json", "list", "--color=always", "--unicode=never"], "/p");

    expect(parsed.command).toBe("list");
    expect(parsed.nonInteractive).toBe(true);
    expect(parsed.color).toBe("always");
    expect(parsed.unicode).toBe("never");
  });

  test("reports invalid flags and missing values as product errors", () => {
    for (const args of [["--wat"], ["--cwd"], ["run"], ["--package-manager", "other"]]) {
      try {
        parseArguments(args, "/p");
        throw new Error("Expected parseArguments to fail");
      } catch (error) {
        expect(error).toBeInstanceOf(RunpaletteError);
      }
    }
  });

  test("does not reinterpret script arguments as Runpalette flags", () => {
    const parsed = parseArguments(["run", "dev", "--", "--cwd", "elsewhere", "--json"], "/p");

    expect(parsed.cwd).toBe("/p");
    expect(parsed.json).toBe(false);
    expect(parsed.scriptArgs).toEqual(["--cwd", "elsewhere", "--json"]);
  });
});
