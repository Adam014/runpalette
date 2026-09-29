import { afterEach, describe, expect, test } from "bun:test";
import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import process from "node:process";
import { main } from "../../src/cli/main.js";
import { createProject } from "../helpers/project.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function capture(args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  const stdoutWrite = process.stdout.write;
  const stderrWrite = process.stderr.write;
  let stdout = "";
  let stderr = "";
  process.stdout.write = ((chunk: string | Uint8Array) => {
    stdout += typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk);
    return true;
  }) as typeof process.stdout.write;
  process.stderr.write = ((chunk: string | Uint8Array) => {
    stderr += typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk);
    return true;
  }) as typeof process.stderr.write;
  try {
    return { code: await main(args), stdout, stderr };
  } finally {
    process.stdout.write = stdoutWrite;
    process.stderr.write = stderrWrite;
  }
}

async function fixture(): Promise<string> {
  const root = await createProject({
    manifest: {
      name: "main-fixture",
      packageManager: "npm@11",
      scripts: { dev: "node -e \"console.log('ready')\"", test: "node test.js" },
    },
  });
  roots.push(root);
  return root;
}

describe("main", () => {
  test("renders help and versions in human and JSON modes", async () => {
    const help = await capture(["--help"]);
    const asciiHelp = await capture(["--help", "--no-unicode"]);
    const jsonHelp = await capture(["--help", "--json"]);
    const version = await capture(["--version"]);
    const json = await capture(["--version", "--json"]);

    expect(help).toMatchObject({ code: 0, stderr: "" });
    expect(help.stdout).toContain("Usage:");
    expect([...asciiHelp.stdout].every((character) => character.charCodeAt(0) <= 0x7f)).toBe(true);
    expect(JSON.parse(jsonHelp.stdout)).toMatchObject({
      ok: true,
      command: "help",
      data: { text: expect.stringContaining("Usage:") },
    });
    expect(version.stdout).toMatch(/^\d+\.\d+\.\d+\n$/u);
    expect(JSON.parse(json.stdout)).toMatchObject({ ok: true, command: "version" });
  });

  test("lists the same project as plain text, fallback home, and JSON", async () => {
    const root = await fixture();
    const plain = await capture(["list", "--cwd", root, "--non-interactive"]);
    const home = await capture(["--cwd", root, "--non-interactive"]);
    const json = await capture(["list", "--cwd", root, "--json"]);

    expect(plain.code).toBe(0);
    expect(plain.stdout).toContain("main-fixture");
    expect(plain.stdout).toContain("npm");
    expect(home.stdout).toContain("Start & develop");
    expect(JSON.parse(json.stdout).data.commands).toHaveLength(2);
  });

  test("diagnoses project readiness in human and JSON modes", async () => {
    const root = await fixture();
    const human = await capture(["doctor", "--cwd", root, "--no-color"]);
    const json = await capture(["doctor", "--cwd", root, "--json"]);

    expect(human).toMatchObject({ code: 0, stderr: "" });
    expect(human.stdout).toContain("Runpalette doctor");
    expect(human.stdout).toContain("2 runnable commands discovered");
    expect(JSON.parse(json.stdout)).toMatchObject({
      ok: true,
      command: "doctor",
      data: {
        status: "ready",
        configuration: { mode: "zero-config" },
        summary: { commands: 2 },
      },
    });
  });

  test("initializes and validates project configuration without silent overwrite", async () => {
    const root = await fixture();
    const initialized = await capture(["config", "init", "--cwd", root, "--no-color"]);
    const duplicate = await capture(["config", "init", "--cwd", root]);
    const validated = await capture(["config", "validate", "--cwd", root, "--json"]);

    expect(initialized).toMatchObject({ code: 0, stderr: "" });
    expect(initialized.stdout).toContain("Created");
    expect(JSON.parse(await readFile(join(root, "runpalette.json"), "utf8"))).toMatchObject({
      schemaVersion: 1,
      groups: {},
      commands: {},
    });
    expect(duplicate).toMatchObject({ code: 2 });
    expect(duplicate.stderr).toContain("already exists");
    expect(JSON.parse(validated.stdout)).toMatchObject({
      ok: true,
      command: "config",
      data: {
        action: "validate",
        status: "valid",
        configured: { commands: 0 },
        discovered: { runnableCommands: 2 },
      },
    });

    await writeFile(
      join(root, "runpalette.json"),
      JSON.stringify({ schemaVersion: 1, commands: { missing: { hidden: true } } }),
    );
    const warning = await capture(["config", "validate", "--cwd", root, "--no-color"]);
    expect(warning).toMatchObject({ code: 0, stderr: "" });
    expect(warning.stdout).toContain("Valid with warnings");
    expect(warning.stdout).toContain("missing");
  });

  test("honors explicit color and Unicode preferences in plain output", async () => {
    const root = await fixture();
    const ascii = await capture(["list", "--cwd", root, "--no-color", "--no-unicode"]);
    const colored = await capture(["list", "--cwd", root, "--color=always", "--unicode=never"]);

    expect([...ascii.stdout].every((character) => character.charCodeAt(0) <= 0x7f)).toBe(true);
    expect(ascii.stdout).not.toContain("\u001B[");
    expect(ascii.stdout).toContain("main-fixture | npm | 2 commands");
    expect(colored.stdout).toContain("\u001B[");
    expect(colored.stdout).not.toContain(" · ");
  });

  test("prints human and machine-readable dry-run plans", async () => {
    const root = await fixture();
    const human = await capture(["run", "dev", "--cwd", root, "--dry-run"]);
    const json = await capture(["run", "dev", "--cwd", root, "--dry-run", "--json"]);

    expect(human.stdout).toContain("Runpalette plan");
    expect(human.stdout).toContain("Command    dev");
    expect(human.stdout).toContain("Source     package");
    expect(human.stdout).toContain("Workspace  main-fixture");
    expect(human.stdout).toContain("Safety     no confirmation required");
    expect(human.stdout).toContain("$ npm run dev");
    const payload = JSON.parse(json.stdout);
    expect(payload).toMatchObject({
      ok: true,
      command: "run",
      data: { script: { name: "dev" } },
    });
    expect(payload.data.cwd).toBe(payload.data.workspace.root);
  });

  test("returns focused human failures and captured JSON execution", async () => {
    const root = await fixture();
    const human = await capture(["run", "missing", "--cwd", root, "--non-interactive"]);
    const jsonExecution = await capture(["run", "dev", "--cwd", root, "--json"]);
    const invalid = await capture(["--unknown", "--json"]);

    expect(human.code).toBe(2);
    expect(human.stderr).toContain("Closest commands");
    expect(jsonExecution.code).toBe(0);
    expect(JSON.parse(jsonExecution.stdout)).toMatchObject({
      ok: true,
      command: "run",
      data: {
        plan: { script: { name: "dev" } },
        execution: { exitCode: 0, timedOut: false, aborted: false },
      },
    });
    expect(JSON.parse(invalid.stdout).error.code).toBe("ARGUMENT_INVALID");
  });

  test("enforces configuration filters and non-interactive confirmations", async () => {
    const root = await createProject({
      manifest: { name: "safe", packageManager: "npm@11", scripts: { release: "node ship.js" } },
      files: {
        "runpalette.json": JSON.stringify({
          schemaVersion: 1,
          groups: { shipping: { label: "Shipping" } },
          commands: { release: { group: "shipping", confirm: true } },
        }),
      },
    });
    roots.push(root);

    const filtered = await capture(["list", "--cwd", root, "--group", "shipping"]);
    const refused = await capture(["run", "release", "--cwd", root, "--non-interactive"]);

    expect(filtered.stdout).toContain("Shipping");
    expect(refused.code).toBe(2);
    expect(refused.stderr).toContain("Review it with --dry-run");
  });

  test("reports an empty project and a missing project path deterministically", async () => {
    const root = await createProject({ manifest: { name: "empty", scripts: {} } });
    roots.push(root);

    const empty = await capture(["--cwd", root, "--non-interactive"]);
    const missing = await capture(["list", "--cwd", join(root, "missing"), "--json"]);

    expect(empty.code).toBe(0);
    expect(empty.stdout).toContain("No runnable project commands found");
    expect(JSON.parse(missing.stdout).error.code).toBe("PROJECT_PATH_INVALID");
  });

  test("returns a blocking doctor exit code when no commands are available", async () => {
    const root = await createProject({ manifest: { name: "empty", packageManager: "npm@11" } });
    roots.push(root);

    const result = await capture(["doctor", "--cwd", root, "--json"]);

    expect(result.code).toBe(2);
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: false,
      command: "doctor",
      data: {
        status: "error",
        checks: expect.arrayContaining([
          expect.objectContaining({ id: "commands", status: "fail" }),
        ]),
      },
    });
  });
});
