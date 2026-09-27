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
    expect(listed.tools.map(({ name }) => name)).toEqual(["list_commands", "plan_command"]);
    expect(listed.tools[0]?.annotations?.readOnlyHint).toBe(true);

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
      execution: { exitCode: 0, timedOut: false, truncated: false },
    });
    expect(
      (execution.structuredContent as { execution: { stdout: string } }).execution.stdout,
    ).toContain("agent-ready");
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
