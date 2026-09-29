# MCP and coding agents

Runpalette gives coding agents a structured view of the same commands humans
see in the terminal. The MCP server uses stdio, writes no UI text into the
protocol stream, and is read-only by default.

## Connect a project

Install Runpalette in the project, then configure the MCP client to launch the
installed entry point from that project directory:

```json
{
  "mcpServers": {
    "runpalette": {
      "command": "node",
      "args": ["./node_modules/runpalette/dist/cli.js", "mcp"],
      "cwd": "/absolute/path/to/project"
    }
  }
}
```

The exact outer configuration key differs by MCP client. The command, argument
array, and project working directory stay the same.

## Default tools

| Tool | Side effects | Purpose |
| --- | --- | --- |
| `check_project` | none | Validate project, command-source, package-manager, and optional configuration readiness |
| `list_commands` | none | Return the normalized catalog; optionally filter by group, workspace, or source |
| `plan_command` | none | Resolve a name or alias to its exact executable, arguments, cwd, source, and safety policy |

All three tools return structured, schema-versioned content. `check_project`
also declares an MCP output schema and reports stale configuration selectors as
warnings without requiring a config file for zero-config projects. Paths are
relative to the selected project where possible, so results remain useful
without exposing an absolute local directory layout.

## Opt-in execution

Execution is absent from the default server. Add it deliberately:

```json
{
  "command": "node",
  "args": [
    "./node_modules/runpalette/dist/cli.js",
    "mcp",
    "--allow-execution"
  ],
  "cwd": "/absolute/path/to/project"
}
```

This registers `run_command`. It executes one catalog-owned command without a
shell or stdin, captures a combined maximum of 128 KiB, and accepts a timeout
from 1 to 120 seconds (30 seconds by default). It is therefore intended for
non-interactive commands. Cancelling the MCP request terminates the owned
process tree. The result includes timestamps, duration, exit status, signal,
stdout, stderr, observed and captured byte counts, timeout or cancellation
state, and per-stream truncation state.

Commands protected by `runpalette.json` still fail closed. The agent must call
`plan_command`, present or otherwise obtain the user's approval, and then send
`confirmed: true` in that specific `run_command` call.

`--allow-execution` grants a capable agent access to project commands running
with the current user's permissions. Enable it only for trusted clients and
trusted repositories. Runpalette never executes arbitrary model-generated
shell text; the requested name must resolve to the discovered catalog.

## Recommended agent flow

1. Call `check_project` and resolve blockers before attempting work.
2. Call `list_commands` with a focused group or source when appropriate.
3. Call `plan_command` for the selected name and arguments.
4. Inspect the source, working directory, exact argument array, and safety
   metadata.
5. Ask for confirmation when the plan requires it.
6. Call `run_command` only when execution was enabled intentionally.
7. Treat a non-zero exit, timeout, cancellation, or truncated output as
   explicit state rather than assuming success.
