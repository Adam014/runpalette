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
      yes: false,
      allowExecution: false,
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
    expect(parsed.yes).toBe(false);
  });

  test("parses bounded captured execution values with human-readable units", () => {
    const parsed = parseArguments(
      ["run", "test", "--json", "--timeout=90s", "--max-output", "2MiB"],
      "/p",
    );

    expect(parsed.timeoutMs).toBe(90_000);
    expect(parsed.maxOutputBytes).toBe(2 * 1_048_576);
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

  test("parses workspace, group, config, and explicit confirmation", () => {
    const parsed = parseArguments(
      ["list", "--workspace", "@acme/api", "--group=quality", "--config", "custom.json", "-y"],
      "/p",
    );

    expect(parsed.workspace).toBe("@acme/api");
    expect(parsed.group).toBe("quality");
    expect(parsed.config).toBe("custom.json");
    expect(parsed.yes).toBe(true);
  });

  test("parses source filters and the opt-in MCP execution mode", () => {
    const parsed = parseArguments(["mcp", "--allow-execution"], "/p");
    expect(parsed.command).toBe("mcp");
    expect(parsed.allowExecution).toBe(true);
    expect(() => parseArguments(["list", "--allow-execution"], "/p")).toThrow("only valid");
    expect(() => parseArguments(["mcp", "--source", "just"], "/p")).toThrow("MCP tool inputs");
    expect(() => parseArguments(["mcp", "--json"], "/p")).toThrow("cannot be used");
  });

  test("parses doctor and rejects filters or execution-only options", () => {
    expect(parseArguments(["doctor", "--json"], "/p")).toMatchObject({
      command: "doctor",
      json: true,
      nonInteractive: true,
    });
    expect(() => parseArguments(["doctor", "--workspace", "api"], "/p")).toThrow("cannot be used");
    expect(() => parseArguments(["doctor", "--dry-run"], "/p")).toThrow("cannot be used");
  });

  test("supports every documented shorthand and inline value", () => {
    const parsed = parseArguments(
      [
        "list",
        "--cwd=./repo",
        "--workspace=packages/web",
        "--config=runpalette.ci.json",
        "--package-manager",
        "bun",
        "--color=never",
        "--unicode=always",
        "--no-color",
        "--no-unicode",
        "--dry-run",
        "--yes",
      ],
      "/p",
    );

    expect(parsed).toMatchObject({
      cwd: "./repo",
      workspace: "packages/web",
      config: "runpalette.ci.json",
      packageManager: "bun",
      color: "never",
      unicode: "never",
      dryRun: true,
      yes: true,
    });
    expect(parseArguments(["-h"], "/p").command).toBe("help");
    expect(parseArguments(["-V"], "/p").command).toBe("version");
  });

  test("rejects incomplete and invalid forms with focused errors", () => {
    for (const args of [
      ["--workspace="],
      ["--group="],
      ["--config="],
      ["--color=sometimes"],
      ["--unicode=wide"],
      ["--package-manager=other"],
      ["--source=unknown"],
      ["--"],
      ["list", "extra"],
      ["run", "test", "--timeout", "30s"],
      ["run", "test", "--json", "--dry-run", "--max-output", "1MiB"],
      ["run", "test", "--json", "--timeout", "30"],
      ["run", "test", "--json", "--timeout", "25h"],
      ["run", "test", "--json", "--max-output", "17MiB"],
      ["list", "--json", "--max-output", "1MiB"],
    ]) {
      expect(() => parseArguments(args, "/p")).toThrow();
    }
  });
});
