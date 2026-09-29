import { afterEach, describe, expect, test } from "bun:test";
import { rm } from "node:fs/promises";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import type { McpServer } from "@modelcontextprotocol/server";
import { createMcpServer } from "../../src/mcp/server.js";
import { createProject } from "../helpers/project.js";

const projects: string[] = [];
const clients: Client[] = [];
const servers: McpServer[] = [];

afterEach(async () => {
  await Promise.all(clients.splice(0).map(async (client) => await client.close()));
  await Promise.all(servers.splice(0).map(async (server) => await server.close()));
  await Promise.all(projects.splice(0).map(async (root) => await rm(root, { recursive: true })));
});

async function connect(cwd: string, allowExecution: boolean): Promise<Client> {
  const server = createMcpServer({ cwd, allowExecution, version: "test" });
  const client = new Client({ name: "runpalette-tests", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  clients.push(client);
  servers.push(server);
  return client;
}

describe("Runpalette MCP bridge", () => {
  test("is read-only by default and returns the same source-aware catalog and plan", async () => {
    const root = await createProject({
      manifest: {
        name: "mcp-fixture",
        packageManager: "npm@11",
        scripts: { test: "node -e \"console.log('ok')\"" },
      },
    });
    projects.push(root);
    const client = await connect(root, false);

    const listed = await client.listTools();
    expect(listed.tools.map(({ name }) => name)).toEqual([
      "check_project",
      "list_commands",
      "plan_command",
    ]);
    expect(listed.tools[0]?.annotations?.readOnlyHint).toBe(true);
    expect(listed.tools[0]?.annotations?.openWorldHint).toBe(false);
    expect(listed.tools[0]?.outputSchema).toBeDefined();

    const checked = await client.callTool({ name: "check_project", arguments: {} });
    expect(checked.isError).not.toBe(true);
    expect(checked.structuredContent).toMatchObject({
      schemaVersion: 1,
      ok: true,
      status: "ready",
      doctor: { summary: { commands: 1 }, configuration: { mode: "zero-config" } },
      configuration: null,
    });

    const catalogResult = await client.callTool({ name: "list_commands", arguments: {} });
    expect(catalogResult.isError).not.toBe(true);
    expect(catalogResult.structuredContent).toMatchObject({
      schemaVersion: 1,
      ok: true,
      catalog: { sources: ["package"] },
    });

    const planResult = await client.callTool({
      name: "plan_command",
      arguments: { name: "test", args: ["--watch"] },
    });
    expect(planResult.structuredContent).toMatchObject({
      ok: true,
      plan: { executable: "npm", args: ["run", "test", "--", "--watch"] },
    });
  });

  test("surfaces stale configuration as a read-only project warning", async () => {
    const root = await createProject({
      manifest: {
        name: "mcp-config",
        packageManager: "npm@11",
        scripts: { test: "node test.js" },
      },
      files: {
        "runpalette.json": JSON.stringify({
          schemaVersion: 1,
          commands: { missing: { label: "Stale command" } },
        }),
      },
    });
    projects.push(root);
    const client = await connect(root, false);

    const checked = await client.callTool({ name: "check_project", arguments: {} });
    expect(checked.isError).not.toBe(true);
    expect(checked.structuredContent).toMatchObject({
      ok: true,
      status: "warning",
      doctor: { configuration: { mode: "file", path: "runpalette.json" } },
      configuration: { status: "warning", unmatchedSelectors: ["missing"] },
    });
  });

  test("reports project blockers as structured readiness instead of a protocol failure", async () => {
    const root = await createProject({
      manifest: { name: "mcp-empty", packageManager: "npm@11", scripts: {} },
    });
    projects.push(root);
    const client = await connect(root, false);

    const checked = await client.callTool({ name: "check_project", arguments: {} });
    expect(checked.isError).not.toBe(true);
    expect(checked.structuredContent).toMatchObject({
      ok: false,
      status: "error",
      doctor: {
        status: "error",
        checks: expect.arrayContaining([
          expect.objectContaining({ id: "commands", status: "fail" }),
        ]),
      },
    });
  });

  test("exposes bounded execution only after explicit server opt-in", async () => {
    const root = await createProject({
      manifest: {
        name: "mcp-execution",
        packageManager: "npm@11",
        scripts: { echo: "node -e \"process.stdout.write('agent-ready')\"" },
      },
    });
    projects.push(root);
    const client = await connect(root, true);
    const listed = await client.listTools();
    expect(listed.tools.map(({ name }) => name)).toContain("run_command");
    expect(
      listed.tools.find(({ name }) => name === "run_command")?.annotations?.destructiveHint,
    ).toBe(true);

    const execution = await client.callTool({
      name: "run_command",
      arguments: { name: "echo", timeoutMs: 10_000 },
    });
    expect(execution.isError).not.toBe(true);
    expect(execution.structuredContent).toMatchObject({
      ok: true,
      execution: {
        exitCode: 0,
        timedOut: false,
        aborted: false,
        truncated: false,
        maxOutputBytes: 128 * 1024,
      },
    });
    const captured = execution.structuredContent as {
      execution: {
        stdout: string;
        stdoutBytes: number;
        stderrBytes: number;
        capturedBytes: number;
      };
    };
    expect(captured.execution.stdoutBytes).toBeGreaterThanOrEqual(11);
    expect(captured.execution.capturedBytes).toBe(
      captured.execution.stdoutBytes + captured.execution.stderrBytes,
    );
    expect(captured.execution.stdout).toContain("agent-ready");
  });

  test("requires per-call confirmation for protected commands", async () => {
    const root = await createProject({
      manifest: {
        name: "mcp-protected",
        packageManager: "npm@11",
        scripts: { release: "node -e \"process.stdout.write('released')\"" },
      },
      files: {
        "runpalette.json": JSON.stringify({
          schemaVersion: 1,
          commands: { release: { confirm: "Publishes externally." } },
        }),
      },
    });
    projects.push(root);
    const client = await connect(root, true);

    const refused = await client.callTool({
      name: "run_command",
      arguments: { name: "release" },
    });
    expect(refused.isError).toBe(true);
    expect((refused.content[0] as { text: string }).text).toContain("CONFIRMATION_REQUIRED");

    const approved = await client.callTool({
      name: "run_command",
      arguments: { name: "release", confirmed: true },
    });
    expect(approved.isError).not.toBe(true);
    expect(
      (approved.structuredContent as { execution: { stdout: string } }).execution.stdout,
    ).toContain("released");
  });

  test("plans missing requirements but refuses MCP execution before launch", async () => {
    const root = await createProject({
      manifest: {
        name: "mcp-requirements",
        packageManager: "npm@11",
        scripts: { deploy: "node -e \"process.stdout.write('should-not-run')\"" },
      },
      files: {
        "runpalette.json": JSON.stringify({
          schemaVersion: 1,
          commands: {
            deploy: { requires: { environment: ["RUNPALETTE_TEST_MISSING_ENV"] } },
          },
        }),
      },
    });
    projects.push(root);
    const client = await connect(root, true);

    const planned = await client.callTool({
      name: "plan_command",
      arguments: { name: "deploy" },
    });
    expect(planned.structuredContent).toMatchObject({
      ok: true,
      plan: {
        readiness: { ready: false, missingEnvironment: ["RUNPALETTE_TEST_MISSING_ENV"] },
      },
    });

    const refused = await client.callTool({
      name: "run_command",
      arguments: { name: "deploy" },
    });
    expect(refused.isError).toBe(true);
    expect((refused.content[0] as { text: string }).text).toContain("COMMAND_REQUIREMENTS_UNMET");
  });

  test("returns source filters and failed child results through the MCP contract", async () => {
    const root = await createProject({
      manifest: {
        name: "mcp-errors",
        packageManager: "npm@11",
        scripts: {
          test: 'node -e "process.exit(7)"',
          build: "node -e \"process.stdout.write('build')\"",
        },
      },
    });
    projects.push(root);
    const client = await connect(root, true);

    const filtered = await client.callTool({
      name: "list_commands",
      arguments: { group: "quality", source: "package" },
    });
    expect(filtered.structuredContent).toMatchObject({
      catalog: { commands: [{ name: "test" }] },
    });

    const failed = await client.callTool({
      name: "run_command",
      arguments: { name: "test" },
    });
    expect(failed.isError).toBe(true);
    expect(failed.structuredContent).toMatchObject({
      ok: false,
      execution: { exitCode: 7, timedOut: false },
    });
  });
});
