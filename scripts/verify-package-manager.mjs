import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import spawn from "cross-spawn";

const manager = process.argv[2];
const supported = new Set(["npm", "pnpm", "yarn", "bun"]);
if (!manager || !supported.has(manager)) {
  throw new Error("Usage: bun run scripts/verify-package-manager.mjs npm|pnpm|yarn|bun");
}

function run(command, args, options = {}) {
  const result = spawn.sync(command, args, {
    cwd: process.cwd(),
    env: process.env,
    encoding: "utf8",
    ...options,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const output = [result.stdout, result.stderr].filter(Boolean).join("\n");
    throw new Error(`${command} ${args.join(" ")} exited with ${result.status}\n${output}`);
  }
  return result.stdout ?? "";
}

const installArgs = {
  npm: (tarball) => ["install", "--ignore-scripts", "--no-package-lock", tarball],
  pnpm: (tarball) => ["add", "--ignore-scripts", "--lockfile=false", tarball],
  yarn: (tarball) => ["add", tarball],
  bun: (tarball) => ["add", "--ignore-scripts", tarball],
};

const executeArgs = {
  npm: ["exec", "--", "runpalette", "--version"],
  pnpm: ["exec", "runpalette", "--version"],
  yarn: ["run", "runpalette", "--version"],
  bun: ["run", "runpalette", "--version"],
};

const projectManifest = JSON.parse(
  await readFile(new URL("../package.json", import.meta.url), "utf8"),
);
const temporary = await mkdtemp(join(tmpdir(), `runpalette-${manager}-`));

try {
  const packOutput = run("npm", ["pack", "--json", "--pack-destination", temporary]);
  const packs = JSON.parse(packOutput);
  const filename = packs[0]?.filename;
  if (typeof filename !== "string") throw new Error("npm pack returned an unexpected result");

  const consumer = join(temporary, "consumer");
  await mkdir(consumer);
  await writeFile(
    join(consumer, "package.json"),
    `${JSON.stringify({ name: `runpalette-${manager}-consumer`, private: true }, null, 2)}\n`,
  );

  const tarball = join(temporary, filename);
  run(manager, installArgs[manager](tarball), { cwd: consumer });
  const output = run(manager, executeArgs[manager], { cwd: consumer });
  const versions = output.split(/\r?\n/u).map((line) => line.trim());
  if (!versions.includes(projectManifest.version)) {
    throw new Error(
      `Expected Runpalette ${projectManifest.version}, received ${output.trim() || "no output"}`,
    );
  }
} finally {
  await rm(temporary, { recursive: true, force: true });
}
