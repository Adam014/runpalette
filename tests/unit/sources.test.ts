import { afterEach, describe, expect, test } from "bun:test";
import { chmod, mkdir, rm, unlink, writeFile } from "node:fs/promises";
import { delimiter, join } from "node:path";
import { discoverProject } from "../../src/core/project.js";
import {
  discoverExternalCommands,
  parseCargoAliases,
  parseGradleTasks,
  parseJustDump,
  parseMakefile,
  parseTaskList,
} from "../../src/core/sources.js";
import { createProject } from "../helpers/project.js";

const temporaryProjects: string[] = [];
const originalPath = process.env.PATH;

afterEach(async () => {
  process.env.PATH = originalPath;
  await Promise.all(
    temporaryProjects.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});

async function fakeSourceTools(root: string): Promise<string> {
  const bin = join(root, "fake-bin");
  await mkdir(bin);
  const program = join(bin, "source-tool.mjs");
  await writeFile(
    program,
    [
      "const tool = process.argv[2];",
      "if (tool === 'just') console.log(JSON.stringify({recipes:{dev:{doc:'Start',private:false}}}));",
      "else if (tool === 'task') console.log(JSON.stringify({tasks:[{task:'test',desc:'Test'}]}));",
      "else if (process.argv.includes('--no-daemon')) process.exit(9);",
      "else console.log('Build tasks\\n-----------\\nassemble - Assemble the project');",
    ].join("\n"),
  );
  for (const tool of ["just", "task", "gradle"]) {
    if (process.platform === "win32") {
      await writeFile(join(bin, `${tool}.cmd`), `@node "${program}" ${tool} %*\r\n`);
    } else {
      const executable = join(bin, tool);
      await writeFile(executable, `#!/bin/sh\nexec node "${program}" ${tool} "$@"\n`);
      await chmod(executable, 0o755);
    }
  }
  return bin;
}

describe("project command source parsers", () => {
  test("discovers only intentionally public Make targets without evaluating the file", () => {
    const commands = parseMakefile(
      [
        ".PHONY: dev clean",
        "dev: ## Start the development server",
        "\t@npm run dev",
        "clean:",
        "build: src/main.ts ## Build the app",
        "internal: src/private.ts",
        "%.o: %.c",
        ".hidden:",
      ].join("\n"),
      "/repo/Makefile",
    );
    expect(commands.map(({ name }) => name)).toEqual(["dev", "clean", "build"]);
    expect(commands[0]?.description).toBe("Start the development server");
    expect(commands[0]?.execution).toEqual({ executable: "make", args: ["dev"] });
  });

  test("discovers project-owned Cargo aliases without inventing built-in workflows", () => {
    const commands = parseCargoAliases(
      '[alias]\ncheck-all = "check --all-targets"\nxtask = ["run", "-p", "xtask", "--"]\ninvalid = 4\n',
      "/repo/.cargo/config.toml",
    );
    expect(commands.map(({ name }) => name)).toEqual(["check-all", "xtask"]);
    expect(commands[1]?.script).toContain("cargo xtask -> run -p xtask --");
  });

  test("reads public Just recipes and qualified module recipes from the JSON dump", () => {
    const commands = parseJustDump(
      JSON.stringify({
        recipes: {
          dev: { doc: "Start development", private: false },
          secret: { private: true },
        },
        modules: { mobile: { recipes: { test: { doc: "Test mobile", private: false } } } },
      }),
      "/repo/justfile",
    );
    expect(commands.map(({ name }) => name)).toEqual(["dev", "mobile::test"]);
    expect(commands[1]?.execution).toEqual({ executable: "just", args: ["mobile::test"] });
  });

  test("accepts current Task JSON fields and preserves the native argument separator", () => {
    const commands = parseTaskList(
      JSON.stringify({
        tasks: [
          { task: "dev", desc: "Start" },
          { name: "test", description: "Test" },
        ],
      }),
      "/repo/Taskfile.yml",
    );
    expect(commands.map(({ name }) => name)).toEqual(["dev", "test"]);
    expect(commands[0]?.execution.forwardedArgsSeparator).toBe("--");
  });

  test("parses described and description-less Gradle tasks without mistaking headings for tasks", () => {
    const commands = parseGradleTasks(
      [
        "Build tasks",
        "-----------",
        "assemble - Assembles outputs",
        "clean",
        "",
        "Other tasks",
        "-----------",
        ":app:lint - Runs Android lint",
        "> Task :tasks",
      ].join("\n"),
      "/repo/settings.gradle.kts",
      "/repo/gradlew",
    );
    expect(commands.map(({ name }) => name)).toEqual(["assemble", "clean", ":app:lint"]);
    expect(commands[2]?.execution.executable).toBe("/repo/gradlew");
  });

  test("aggregates every source while preserving the project's Gradle daemon policy", async () => {
    const root = await createProject({
      manifest: { name: "mixed-project", scripts: {} },
      files: {
        Makefile: ".PHONY: verify\nverify: ## Verify\n",
        ".cargo/config.toml": '[alias]\ncheck-all = "check --all-targets"\n',
        justfile: "dev:\n  echo dev\n",
        "Taskfile.yml": "version: '3'\ntasks:\n  test:\n    cmds: [echo test]\n",
        "build.gradle": "tasks.register('assemble')\n",
      },
    });
    temporaryProjects.push(root);
    const bin = await fakeSourceTools(root);
    process.env.PATH = `${bin}${delimiter}${originalPath ?? ""}`;

    const discovered = await discoverExternalCommands(await discoverProject({ cwd: root }));
    expect(discovered.diagnostics).toEqual([]);
    expect(discovered.commands.map(({ source, name }) => `${source.kind}:${name}`)).toEqual([
      "make:verify",
      "cargo:check-all",
      "just:dev",
      "task:test",
      "gradle:assemble",
    ]);
  });

  test("keeps optional native sources visible as diagnostics when their tools are missing", async () => {
    const root = await createProject({
      manifest: { name: "missing-tools", scripts: {} },
      files: {
        justfile: "dev:\n  echo dev\n",
        "Taskfile.dist.yml": "version: '3'\n",
        "settings.gradle.kts": 'rootProject.name = "fixture"\n',
      },
    });
    temporaryProjects.push(root);
    process.env.PATH = "";

    const project = await discoverProject({ cwd: root });
    const discovered = await discoverExternalCommands(project);
    expect(discovered.commands).toEqual([]);
    expect(discovered.diagnostics.map(({ source }) => source)).toEqual(["just", "task", "gradle"]);

    await unlink(join(root, "package.json"));
    expect((await discoverProject({ cwd: root })).root).toBe(root);
  });
});
