import { afterEach, describe, expect, test } from "bun:test";
import { rm } from "node:fs/promises";
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
    const version = await capture(["--version"]);
    const json = await capture(["--version", "--json"]);

    expect(help).toMatchObject({ code: 0, stderr: "" });
    expect(help.stdout).toContain("Usage:");
    expect(version.stdout).toMatch(/^\d+\.\d+\.\d+\n$/u);
    expect(JSON.parse(json.stdout)).toMatchObject({ ok: true, command: "version" });
  });

  test("lists the same project as plain text, fallback home, and JSON", async () => {
    const root = await fixture();
    const plain = await capture(["list", "--cwd", root, "--non-interactive"]);
    const home = await capture(["--cwd", root, "--non-interactive"]);
    const json = await capture(["list", "--cwd", root, "--json"]);

    expect(plain.code).toBe(0);
    expect(plain.stdout).toContain("main-fixture · npm");
    expect(home.stdout).toContain("Start & develop");
    expect(JSON.parse(json.stdout).data.commands).toHaveLength(2);
  });

  test("prints human and machine-readable dry-run plans", async () => {
    const root = await fixture();
    const human = await capture(["run", "dev", "--cwd", root, "--dry-run"]);
    const json = await capture(["run", "dev", "--cwd", root, "--dry-run", "--json"]);

    expect(human.stdout).toContain("npm run dev");
    const payload = JSON.parse(json.stdout);
    expect(payload).toMatchObject({
      ok: true,
      command: "run",
      data: { script: { name: "dev" } },
    });
    expect(payload.data.cwd).toBe(payload.data.workspace.root);
  });

  test("returns focused human and JSON failures", async () => {
    const root = await fixture();
    const human = await capture(["run", "missing", "--cwd", root, "--non-interactive"]);
    const jsonExecution = await capture(["run", "dev", "--cwd", root, "--json"]);
    const invalid = await capture(["--unknown", "--json"]);

    expect(human.code).toBe(2);
    expect(human.stderr).toContain("Closest commands");
    expect(JSON.parse(jsonExecution.stdout).error.code).toBe("ARGUMENT_INVALID");
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
    expect(empty.stdout).toContain("No runnable package scripts found");
    expect(JSON.parse(missing.stdout).error.code).toBe("PROJECT_PATH_INVALID");
  });
});
