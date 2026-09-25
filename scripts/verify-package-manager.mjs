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
  npm: (args) => ["exec", "--", "runpalette", ...args],
  pnpm: (args) => ["exec", "runpalette", ...args],
  yarn: (args) => ["run", "runpalette", ...args],
  bun: (args) => ["run", "runpalette", ...args],
};

const managerVersions = {
  npm: "npm@11.6.1",
  pnpm: "pnpm@10.17.1",
  yarn: "yarn@4.10.3",
  bun: "bun@1.3.11",
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
  const workspace = join(consumer, "packages", "app");
  await mkdir(workspace, { recursive: true });
  await writeFile(
    join(consumer, "package.json"),
    `${JSON.stringify(
      {
        name: `runpalette-${manager}-consumer`,
        private: true,
        packageManager: managerVersions[manager],
        workspaces: ["packages/*"],
        scripts: { root: "node -e \"console.log('root-ok')\"" },
      },
      null,
      2,
    )}\n`,
  );
  await writeFile(
    join(workspace, "package.json"),
    `${JSON.stringify(
      {
        name: "@runpalette/acceptance-app",
        private: true,
        scripts: { identify: "node -e \"console.log('workspace-ok')\"" },
      },
      null,
      2,
    )}\n`,
  );
  if (manager === "pnpm") {
    await writeFile(join(consumer, "pnpm-workspace.yaml"), "packages:\n  - 'packages/*'\n");
  }

  const tarball = join(temporary, filename);
  run(manager, installArgs[manager](tarball), { cwd: consumer });
  const output = run(manager, executeArgs[manager](["--version"]), { cwd: consumer });
  const versions = output.split(/\r?\n/u).map((line) => line.trim());
  if (!versions.includes(projectManifest.version)) {
    throw new Error(
      `Expected Runpalette ${projectManifest.version}, received ${output.trim() || "no output"}`,
    );
  }

  const listing = run(manager, executeArgs[manager](["list", "--json"]), { cwd: consumer });
  const payload = JSON.parse(listing.trim());
  const discovered = payload.data?.commands?.some(
    (command) =>
      command.name === "identify" && command.workspace?.name === "@runpalette/acceptance-app",
  );
  if (discovered !== true) {
    throw new Error(`Runpalette did not discover the ${manager} workspace command.\n${listing}`);
  }

  const execution = run(
    manager,
    executeArgs[manager]([
      "run",
      "identify",
      "--workspace",
      "@runpalette/acceptance-app",
      "--non-interactive",
    ]),
    { cwd: consumer },
  );
  if (!execution.includes("workspace-ok")) {
    throw new Error(`Runpalette did not execute inside the ${manager} workspace.\n${execution}`);
  }
} finally {
  await rm(temporary, { recursive: true, force: true });
}
