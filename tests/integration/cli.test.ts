import { afterEach, describe, expect, test } from "bun:test";
import { rm, unlink, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
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
  test("discovers, plans, and executes a pure Make project", async () => {
    const root = await createProject({ manifest: {} });
    temporaryProjects.push(root);
    await unlink(join(root, "package.json"));
    await writeFile(
      join(root, "Makefile"),
      ".PHONY: verify\nverify: ## Verify the native project\n\t@printf 'make-ready'\n",
    );

    const listed = run(["list", "--cwd", root, "--json"]);
    const catalog = JSON.parse(listed.stdout) as {
      data: { sources: string[]; packageManager?: unknown; commands: Array<{ name: string }> };
    };
    expect(listed.exitCode).toBe(0);
    expect(catalog.data.sources).toEqual(["make"]);
    expect(catalog.data.packageManager).toBeUndefined();
    expect(catalog.data.commands.map(({ name }) => name)).toEqual(["verify"]);

    const planned = run([
      "run",
      "verify",
      "--source",
      "make",
      "--cwd",
      root,
      "--dry-run",
      "--json",
    ]);
    expect(JSON.parse(planned.stdout).data).toMatchObject({
      executable: "make",
      args: ["verify"],
      source: { kind: "make", path: relative(import.meta.dir, join(root, "Makefile")) },
    });

    const executed = run(["run", "verify", "--source", "make", "--cwd", root]);
    expect(executed.exitCode).toBe(0);
    expect(executed.stdout).toContain("make-ready");
  });

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

  test("returns a machine-readable project readiness report", async () => {
    const root = await project({ dev: "vite", test: "vitest" });
    const result = run(["doctor", "--json", "--cwd", root]);
    const payload = JSON.parse(result.stdout) as {
      data: { status: string; project: { root: string }; summary: { commands: number } };
    };

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(payload.data).toMatchObject({ status: "ready", summary: { commands: 2 } });
    expect(payload.data.project.root).not.toStartWith("/");
  });

  test("generates shell integration and discovers dynamic completion candidates", async () => {
    const root = await project({ dev: "vite", "test:unit": "vitest" });
    const generated = run(["completion", "bash"]);
    const candidates = run(["__complete", "--cwd", root]);

    expect(generated.exitCode).toBe(0);
    expect(generated.stdout).toContain("_runpalette_completion");
    expect(generated.stderr).toBe("");
    expect(candidates).toMatchObject({ exitCode: 0, stderr: "" });
    expect(candidates.stdout.trim().split("\n")).toEqual(["dev", "test:unit"]);
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

  test("explains a human dry-run without executing the command", async () => {
    const root = await project({ release: "node publish.js" });
    const result = run(["run", "release", "--cwd", root, "--dry-run"]);

    expect(result).toMatchObject({ exitCode: 0, stderr: "" });
    expect(result.stdout).toContain("Runpalette plan");
    expect(result.stdout).toContain("Source     package");
    expect(result.stdout).toContain("Workspace  fixture-app");
    expect(result.stdout).toContain("Directory");
    expect(result.stdout).toContain("Safety     no confirmation required");
    expect(result.stdout).toContain("$ npm run release");
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

  test("captures actual execution as one bounded JSON result", async () => {
    const root = await project({
      report: "node -e \"process.stdout.write('ready'); process.stderr.write('warning')\"",
    });
    const result = run([
      "run",
      "report",
      "--cwd",
      root,
      "--json",
      "--timeout",
      "10s",
      "--max-output",
      "1MiB",
    ]);
    const payload = JSON.parse(result.stdout) as {
      ok: boolean;
      data: {
        plan: { script: { name: string } };
        execution: {
          exitCode: number;
          stdout: string;
          stderr: string;
          maxOutputBytes: number;
          timedOut: boolean;
          aborted: boolean;
        };
      };
    };

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(payload.ok).toBe(true);
    expect(payload.data.plan.script.name).toBe("report");
    expect(payload.data.execution).toMatchObject({
      exitCode: 0,
      maxOutputBytes: 1_048_576,
      timedOut: false,
      aborted: false,
    });
    expect(payload.data.execution.stdout).toContain("ready");
    expect(payload.data.execution.stderr).toContain("warning");
  });

  test("preserves failed, timed-out, and truncated JSON execution states", async () => {
    const root = await project({
      fail: 'node -e "process.exit(7)"',
      hang: 'node -e "setInterval(() => {}, 1000)"',
      noisy: "node -e \"process.stdout.write('x'.repeat(1000))\"",
    });
    const failed = run(["run", "fail", "--cwd", root, "--json"]);
    const timedOut = run(["run", "hang", "--cwd", root, "--json", "--timeout", "50ms"]);
    const truncated = run(["run", "noisy", "--cwd", root, "--json", "--max-output", "100B"]);

    expect(failed.exitCode).toBe(7);
    expect(JSON.parse(failed.stdout)).toMatchObject({
      ok: false,
      data: { execution: { exitCode: 7, timedOut: false } },
    });
    expect(timedOut.exitCode).toBe(124);
    expect(JSON.parse(timedOut.stdout)).toMatchObject({
      ok: false,
      data: { execution: { timedOut: true, aborted: false } },
    });
    expect(truncated.exitCode).toBe(0);
    expect(JSON.parse(truncated.stdout)).toMatchObject({
      ok: true,
      data: {
        execution: { truncated: true, capturedBytes: 100, maxOutputBytes: 100 },
      },
    });
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

  test("applies config aliases and refuses protected execution without explicit approval", async () => {
    const root = await createProject({
      manifest: {
        name: "protected-app",
        packageManager: "npm@11",
        scripts: { release: "node -e \"console.log('published')\"" },
      },
      files: {
        "runpalette.json": JSON.stringify({
          schemaVersion: 1,
          commands: {
            release: {
              aliases: ["ship"],
              confirm: "This publishes the package.",
            },
          },
        }),
      },
    });
    temporaryProjects.push(root);

    const refused = run(["run", "ship", "--cwd", root, "--non-interactive"]);
    expect(refused.exitCode).toBe(2);
    expect(refused.stderr).toContain("requires confirmation");

    const approved = run(["run", "ship", "--cwd", root, "--non-interactive", "--yes"]);
    expect(approved.exitCode).toBe(0);
    expect(approved.stdout).toContain("published");
  });

  test("requires a workspace for ambiguous scripts and executes the selected package", async () => {
    const root = await createProject({
      manifest: {
        name: "workspace-root",
        packageManager: "npm@11",
        workspaces: ["packages/*"],
        scripts: {},
      },
      files: {
        "packages/a/package.json": JSON.stringify({
          name: "@acme/a",
          scripts: { identify: "node -e \"console.log('workspace-a')\"" },
        }),
        "packages/b/package.json": JSON.stringify({
          name: "@acme/b",
          scripts: { identify: "node -e \"console.log('workspace-b')\"" },
        }),
      },
    });
    temporaryProjects.push(root);

    const ambiguous = run(["run", "identify", "--cwd", root, "--non-interactive"]);
    expect(ambiguous.exitCode).toBe(2);
    expect(ambiguous.stderr).toContain("exists in multiple workspaces");

    const selected = run([
      "run",
      "identify",
      "--cwd",
      root,
      "--workspace",
      "@acme/b",
      "--non-interactive",
    ]);
    expect(selected.exitCode).toBe(0);
    expect(selected.stdout).toContain("workspace-b");
  });
});
