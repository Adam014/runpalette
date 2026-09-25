import { afterEach, describe, expect, test } from "bun:test";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { createProject } from "../helpers/project.js";

const cli = join(import.meta.dir, "../../src/cli.ts");
const temporaryProjects: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryProjects.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});

async function project(scripts: Record<string, string>): Promise<string> {
  const root = await createProject({
    manifest: { name: "fixture-app", packageManager: "npm@11.0.0", scripts },
  });
  temporaryProjects.push(root);
  return root;
}

function run(args: readonly string[]): { exitCode: number; stdout: string; stderr: string } {
  const result = Bun.spawnSync({
    cmd: [process.execPath, cli, ...args],
    cwd: import.meta.dir,
    env: { ...process.env, NO_COLOR: "1", TERM: "dumb" },
    stdout: "pipe",
    stderr: "pipe",
  });
  return {
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  };
}

describe("Runpalette CLI", () => {
  test("returns one stable JSON catalog without terminal decoration", async () => {
    const root = await project({ dev: "vite", predev: "node prep.js", test: "vitest" });
    const result = run(["list", "--json", "--cwd", root]);
    const payload = JSON.parse(result.stdout) as {
      ok: boolean;
      command: string;
      data: { project: { root: string }; commands: Array<{ name: string }> };
    };

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(payload.ok).toBe(true);
    expect(payload.command).toBe("list");
    expect(payload.data.project.root).not.toStartWith("/");
    expect(payload.data.commands.map(({ name }) => name)).toEqual(["dev", "test"]);
  });

  test("returns the exact delegated invocation in dry-run JSON", async () => {
    const root = await project({ check: "node check.js" });
    const result = run(["run", "check", "--cwd", root, "--dry-run", "--json", "--", "a b"]);
    const payload = JSON.parse(result.stdout) as {
      data: { executable: string; args: string[]; cwd: string };
    };

    expect(result.exitCode).toBe(0);
    expect(payload.data.executable).toBe("npm");
    expect(payload.data.args).toEqual(["run", "check", "--", "a b"]);
    expect(payload.data.cwd).not.toStartWith("/");
  });

  test("executes through the detected package manager and preserves arguments", async () => {
    const root = await project({
      echoargs: "node -e \"console.log(process.argv.slice(1).join('|'))\"",
    });
    const result = run(["run", "echoargs", "--cwd", root, "--", "first", "two words"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("first|two words");
    expect(result.stderr).toContain('$ npm run echoargs -- first "two words"');
  });

  test("forwards a failed script exit code", async () => {
    const root = await project({ fail: 'node -e "process.exit(7)"' });
    const result = run(["run", "fail", "--cwd", root]);

    expect(result.exitCode).toBe(7);
  });

  test("reports project errors as a single machine-readable failure", () => {
    const result = run(["list", "--json", "--cwd", "/path/that/does/not/exist"]);
    const payload = JSON.parse(result.stdout) as {
      ok: boolean;
      error: { code: string; hint: string };
    };

    expect(result.exitCode).toBe(2);
    expect(payload.ok).toBe(false);
    expect(payload.error.code).toBe("PROJECT_PATH_INVALID");
    expect(payload.error.hint).toContain("--cwd");
    expect(result.stderr).toBe("");
  });
});
