import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";

const color = process.stdout.isTTY && process.env.NO_COLOR === undefined;
const green = (value) => (color ? `\u001B[32m${value}\u001B[0m` : value);
const red = (value) => (color ? `\u001B[31m${value}\u001B[0m` : value);
const dim = (value) => (color ? `\u001B[2m${value}\u001B[0m` : value);

function run(command, args, options = {}) {
  const result = Bun.spawnSync({
    cmd: [command, ...args],
    cwd: process.cwd(),
    env: process.env,
    stdout: "pipe",
    stderr: "pipe",
    ...options,
  });
  if (result.exitCode !== 0) {
    const output = [result.stdout.toString(), result.stderr.toString()].filter(Boolean).join("\n");
    throw new Error(`${command} ${args.join(" ")} exited with ${result.exitCode}\n${output}`);
  }
  return result.stdout.toString();
}

async function privateBoundary() {
  run("git", ["check-ignore", "-q", "AGENTS.md"]);
  run("git", ["check-ignore", "-q", "context/README.md"]);
  const tracked = run("git", ["ls-files", "--", "AGENTS.md", "context"]);
  if (tracked.trim() !== "") throw new Error(`Private files are tracked:\n${tracked}`);
}

async function packedArtifact() {
  const temporary = await mkdtemp(join(tmpdir(), "runpalette-pack-"));
  try {
    const packOutput = run("npm", ["pack", "--json", "--pack-destination", temporary]);
    const packs = JSON.parse(packOutput);
    const pack = packs[0];
    if (pack === undefined || typeof pack.filename !== "string" || !Array.isArray(pack.files)) {
      throw new Error("npm pack returned an unexpected result");
    }
    const paths = new Set(pack.files.map((file) => file.path));
    for (const required of [
      "package.json",
      "README.md",
      "LICENSE",
      "docs/CLI.md",
      "dist/cli.js",
      "dist/cli/main.js",
      "dist/core/catalog.js",
      "dist/ui/palette.js",
    ]) {
      if (!paths.has(required)) throw new Error(`Packed artifact is missing ${required}`);
    }
    if ([...paths].some((path) => path === "AGENTS.md" || path.startsWith("context/"))) {
      throw new Error("Packed artifact contains private project context");
    }
    if ([...paths].some((path) => path.startsWith("docs/assets/"))) {
      throw new Error("Packed artifact contains repository-only marketing media");
    }

    const consumer = join(temporary, "consumer");
    await mkdir(consumer);
    await writeFile(
      join(consumer, "package.json"),
      `${JSON.stringify({ name: "consumer", private: true }, null, 2)}\n`,
    );
    run(
      "npm",
      ["install", "--ignore-scripts", "--no-package-lock", join(temporary, pack.filename)],
      {
        cwd: consumer,
      },
    );
    const help = run(
      process.execPath,
      [join(consumer, "node_modules/runpalette/dist/cli.js"), "--help"],
      {
        cwd: consumer,
      },
    );
    if (!help.includes("Open the interactive command palette")) {
      throw new Error("Installed CLI smoke test returned unexpected help output");
    }
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

const steps = [
  ["diff hygiene", () => run("git", ["diff", "--check"])],
  ["private-context boundary", privateBoundary],
  ["TypeScript", () => run("bun", ["run", "typecheck"])],
  ["Biome", () => run("bun", ["run", "lint"])],
  ["unit and integration tests", () => run("bun", ["test"])],
  ["production build", () => run("bun", ["run", "build"])],
  ["Node.js artifact", () => run("node", ["dist/cli.js", "--version"])],
  ["Bun artifact", () => run("bun", ["dist/cli.js", "--version"])],
  ["packed consumer install", packedArtifact],
];

process.stdout.write("Runpalette verification\n\n");
for (const [name, action] of steps) {
  const started = performance.now();
  try {
    await action();
    const duration = `${Math.round(performance.now() - started)}ms`;
    process.stdout.write(`${name.padEnd(31)} ${green("OK")}  ${dim(duration)}\n`);
  } catch (error) {
    process.stdout.write(`${name.padEnd(31)} ${red("FAIL")}\n\n`);
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
    break;
  }
}
