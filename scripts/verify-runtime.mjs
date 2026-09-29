import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import spawn from "cross-spawn";

const runtime = process.argv[2];
const runners = {
  node: { command: process.execPath, prefix: [] },
  bun: { command: "bun", prefix: [] },
  deno: {
    command: "deno",
    prefix: ["run", "--allow-read", "--allow-env", "--allow-run", "--allow-sys"],
  },
};
const runner = runners[runtime];
if (runner === undefined) {
  throw new Error("Usage: bun run scripts/verify-runtime.mjs node|bun|deno");
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

const temporary = await mkdtemp(join(tmpdir(), `runpalette-${runtime}-`));
try {
  const pack = JSON.parse(run("npm", ["pack", "--json", "--pack-destination", temporary]))[0];
  if (pack === undefined || typeof pack.filename !== "string") {
    throw new Error("npm pack returned an unexpected result");
  }

  const consumer = join(temporary, "consumer");
  await mkdir(consumer);
  await writeFile(
    join(consumer, "package.json"),
    `${JSON.stringify(
      {
        name: `${runtime}-runtime-consumer`,
        private: true,
        packageManager: "npm@11",
        scripts: {
          probe: "node -e \"console.log(process.argv.slice(1).join('|'))\"",
        },
      },
      null,
      2,
    )}\n`,
  );
  run("npm", ["install", "--ignore-scripts", "--no-package-lock", join(temporary, pack.filename)], {
    cwd: consumer,
  });

  const cli = join(consumer, "node_modules/runpalette/dist/cli.js");
  const invoke = (args) => run(runner.command, [...runner.prefix, cli, ...args], { cwd: consumer });
  const invokeConfigInit = () =>
    runtime === "deno"
      ? run(
          "deno",
          [
            "run",
            "--allow-read",
            "--allow-write",
            "--allow-env",
            "--allow-run",
            "--allow-sys",
            cli,
            "config",
            "init",
            "--json",
          ],
          { cwd: consumer },
        )
      : invoke(["config", "init", "--json"]);
  if (!/^\d+\.\d+\.\d+\n$/u.test(invoke(["--version"]))) {
    throw new Error(`${runtime} returned an invalid version`);
  }
  const doctor = JSON.parse(invoke(["doctor", "--json"]));
  if (doctor.ok !== true || doctor.data?.summary?.commands !== 1) {
    throw new Error(`${runtime} returned an invalid doctor report`);
  }
  const catalog = JSON.parse(invoke(["list", "--json"]));
  if (catalog.data?.commands?.[0]?.name !== "probe") {
    throw new Error(`${runtime} returned an invalid command catalog`);
  }
  const plan = JSON.parse(invoke(["run", "probe", "--dry-run", "--json", "--", "two words"]));
  if (plan.data?.args?.at(-1) !== "two words") {
    throw new Error(`${runtime} did not preserve planned arguments`);
  }
  const execution = JSON.parse(
    invoke(["run", "probe", "--json", "--timeout", "30s", "--", "two words"]),
  );
  if (execution.ok !== true || !execution.data?.execution?.stdout?.includes("two words")) {
    throw new Error(`${runtime} did not complete captured execution`);
  }
  if (!invoke(["completion", "bash"]).includes("_runpalette_completion")) {
    throw new Error(`${runtime} returned an invalid completion script`);
  }
  const initialized = JSON.parse(invokeConfigInit());
  if (initialized.ok !== true || initialized.data?.action !== "init") {
    throw new Error(`${runtime} did not initialize configuration`);
  }
  const validated = JSON.parse(invoke(["config", "validate", "--json"]));
  if (validated.ok !== true || validated.data?.status !== "valid") {
    throw new Error(`${runtime} did not validate configuration`);
  }

  const transport = new StdioClientTransport({
    command: runner.command,
    args: [...runner.prefix, cli, "mcp"],
    cwd: consumer,
    stderr: "pipe",
  });
  const client = new Client({ name: `runpalette-${runtime}-verifier`, version: "1.0.0" });
  let protocolStderr = "";
  transport.stderr?.on("data", (chunk) => {
    protocolStderr += chunk.toString();
  });
  try {
    await client.connect(transport);
    const tools = await client.listTools();
    if (
      tools.tools.map(({ name }) => name).join(",") !== "check_project,list_commands,plan_command"
    ) {
      throw new Error(`${runtime} exposed an invalid MCP tool surface`);
    }
    if (tools.tools.some(({ outputSchema }) => outputSchema === undefined)) {
      throw new Error(`${runtime} exposed an MCP tool without an output schema`);
    }
    const readiness = await client.callTool({ name: "check_project", arguments: {} });
    if (
      readiness.isError === true ||
      readiness.structuredContent?.ok !== true ||
      readiness.structuredContent?.status === "error"
    ) {
      throw new Error(`${runtime} returned invalid project readiness`);
    }
    const result = await client.callTool({ name: "list_commands", arguments: {} });
    if (result.isError === true || result.structuredContent?.ok !== true) {
      throw new Error(`${runtime} returned an invalid MCP command catalog`);
    }
  } finally {
    await client.close();
  }
  if (protocolStderr.trim() !== "") {
    throw new Error(`${runtime} MCP server wrote unexpected diagnostics:\n${protocolStderr}`);
  }

  process.stdout.write(`${runtime} packaged runtime contract OK\n`);
} finally {
  await rm(temporary, { recursive: true, force: true });
}
