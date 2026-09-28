<div align="center">

# Runpalette

**One command palette for every project — and every coding agent.**

Turn package scripts, Justfiles, Taskfiles, Make targets, Cargo aliases, and
Gradle tasks into one searchable, MCP-native command surface for developers,
coding agents, and CI.

[![JSON automation](https://img.shields.io/badge/automation-versioned_JSON-0891b2)](./docs/CLI.md#automation-and-agents)
[![MCP](https://img.shields.io/badge/MCP-native-7c3aed)](./docs/mcp.md)
[![npm](https://img.shields.io/npm/v/runpalette?label=npm&color=cb3837&logo=npm)](https://www.npmjs.com/package/runpalette)
[![CI](https://github.com/Adam014/runpalette/actions/workflows/ci.yml/badge.svg)](https://github.com/Adam014/runpalette/actions/workflows/ci.yml)
[![Coverage](https://codecov.io/gh/Adam014/runpalette/graph/badge.svg)](https://codecov.io/gh/Adam014/runpalette)
[![Node.js](https://img.shields.io/badge/Node.js-%E2%89%A522-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![Package managers](https://img.shields.io/badge/delegates-npm_%C2%B7_pnpm_%C2%B7_Yarn_%C2%B7_Bun-64748b)](./COMPATIBILITY.md)
[![Cross-platform](https://img.shields.io/badge/process_launch-hardened-22c55e)](./COMPATIBILITY.md)
[![License](https://img.shields.io/badge/license-MIT-64748b)](./LICENSE)

[Quick start](#quick-start) · [What it does](#what-runpalette-does) ·
[Agents & MCP](#for-agents-and-automation) · [How it works](#one-project-one-command-surface) ·
[Documentation](#documentation)

<img src="./docs/assets/runpalette-demo.gif" alt="Runpalette discovers project commands, filters them instantly, runs the selected test through pnpm, and returns a machine-readable dry-run plan." width="1120" />

</div>

## Quick start

Try Runpalette without changing the project:

```bash
npx runpalette
```

Runpalette finds the nearest supported project, discovers the commands it
already owns, and opens an immediate type-to-search palette. Nothing needs to
be copied into the target project and Runpalette does not introduce a new task
format.

Install it for the whole team and expose the short project-local command:

```bash
npm install --save-dev runpalette
```

```json
{
  "scripts": {
    "what": "runpalette"
  }
}
```

The same package can be installed with `pnpm add -D runpalette`,
`yarn add -D runpalette`, or `bun add -d runpalette`.

## What Runpalette does

- **Find the project** — walk upward from the current directory or an explicit
  `--cwd` to package, Just, Task, Make, Cargo, or Gradle project metadata.
- **Unify existing tools** — combine every discovered command into one catalog
  without replacing the tool that owns execution.
- **Make commands scannable** — group existing commands into development,
  quality, build/release, data/operations, and a conservative fallback group.
- **Understand workspaces** — discover root and package scripts across npm,
  pnpm, Yarn, and Bun monorepos, then run from the selected package directory.
- **Search immediately** — type any part of a command name or implementation;
  press Tab to focus a group, then use arrows or `Ctrl-N` / `Ctrl-P` to move.
- **Describe your workflows** — add labels, descriptions, aliases, ordering,
  custom groups, defaults, hidden entries, and explicit confirmation without
  replacing the commands your project already owns.
- **Show the exact action** — keep the owning source, delegated command, and
  underlying implementation visible while selecting.
- **Delegate faithfully** — let the original package manager or task tool own
  local binaries, lifecycle behavior, arguments, and exit codes.
- **Serve agents and automation** — expose the same catalog and execution
  plans as versioned JSON, run tasks with bounded structured output, or use
  read-only-by-default MCP tools.

## Choose how you work

### From your terminal

Open the palette from anywhere inside a project:

```bash
runpalette
```

Or skip the interface when you already know the script:

```bash
runpalette list
runpalette list --workspace @acme/web
runpalette list --group quality
runpalette list --source make
runpalette run test:unit
runpalette run verify --source make
runpalette run dev --workspace @acme/web
runpalette run test:unit -- --watch
runpalette run build --dry-run
```

The palette uses an alternate terminal screen and restores the normal terminal
before the selected task starts. The child then receives ordinary stdin,
stdout, and stderr instead of running inside a simulated console.

[Learn the keyboard and command surface →](./docs/CLI.md)

For an optional team-owned command surface, add a validated
[`runpalette.json`](./docs/configuration.md). Monorepos require no Runpalette
configuration; see the [workspace guide](./docs/workspaces.md) for selection and
ambiguity behavior.

### For agents and automation

Give a coding agent or CI job a stable inventory instead of asking it to infer
commands from README prose or execute an unknown shell string:

```bash
runpalette list --json
runpalette run test:e2e --dry-run --json
runpalette run test:e2e --json --timeout 2m
```

`--json` implies non-interactive behavior and writes one versioned result to
stdout. Diagnostics stay on stderr. A dry run returns the exact executable,
argument array, working directory, selected command, and source choice
without executing the task.

For CI and agents, actual JSON execution captures stdout and stderr into one
bounded result while preserving exit status, timing, timeout, cancellation,
and truncation metadata. Captured execution disables stdin; use human stream
mode for an interactive task. Human execution keeps the task's native streams:

```bash
runpalette run verify --non-interactive
```

Or expose the catalog and exact execution plans directly over MCP:

```bash
runpalette mcp
```

The MCP server offers `list_commands` and `plan_command` by default.
`run_command` exists only when the user explicitly starts the server with
`--allow-execution`; configured confirmations still apply to every call and
execution is time/output bounded.

[Connect a coding agent with MCP →](./docs/mcp.md)

## One project. One command surface.

```text
start anywhere inside a project
        ↓
find the nearest supported project source
        ↓
discover commands through source-owned metadata
        ↓
normalize and group one source-aware catalog
        ↓
search or select one exact command
        ↓
preview the execution plan or delegate it unchanged
```

- Automatic install and publishing hooks stay out of the default palette.
- Unknown commands remain visible instead of being silently discarded.
- Conflicting lockfiles produce a warning and deterministic selection.
- Command names and metadata are sanitized before terminal rendering.
- No-argument use outside a TTY prints a deterministic plain catalog and never
  attempts to prompt.
- `NO_COLOR`, `TERM=dumb`, ASCII rendering, narrow terminals, and explicit
  non-interactive operation have first-class paths.

## Keep your existing stack

| Command sources | Package managers | CLI runtime | Interfaces |
| --- | --- | --- | --- |
| package scripts · Just · Task · Make · Cargo aliases · Gradle | npm · pnpm · Yarn · Bun | Node.js 22+ | interactive TTY · text · JSON · MCP |

Package-manager choice is independent from the runtime executing Runpalette.
The `0.3.x` release line targets Node.js 22 or newer. Additional runtimes are
promoted only after the packaged CLI passes their documented test contract.

[See current compatibility evidence →](./COMPATIBILITY.md)

## Predictable by default

- Runpalette constructs an executable plus argument array; it does not build a
  shell command around your selection.
- The detected project root becomes the task working directory.
- Source-specific argument separators are added only where required.
- A missing command or owning executable returns an actionable error.
- Machine output is schema-versioned, prompt-free, and free of ANSI styling.
- Marketing media, private product research, fixtures, and development context
  are excluded from the npm artifact.
- The packaged-consumer check installs the generated tarball into a clean
  project and launches the installed CLI before verification can pass.

## Documentation

| Guide | Start here when you want to… |
| --- | --- |
| [CLI guide](./docs/CLI.md) | Search, navigate, run scripts, pass arguments, or use JSON. |
| [Command sources](./docs/sources.md) | Understand discovery and native execution for each project tool. |
| [MCP and agents](./docs/mcp.md) | Connect an agent, inspect plans, or enable bounded execution. |
| [Configuration](./docs/configuration.md) | Name, group, order, protect, hide, alias, or default commands. |
| [Workspaces](./docs/workspaces.md) | Use Runpalette in npm, pnpm, Yarn, or Bun monorepos. |
| [Compatibility](./COMPATIBILITY.md) | Check runtimes, package managers, terminals, and support status. |
| [Changelog](./CHANGELOG.md) | Review user-visible additions and behavior changes. |
| [Contributing](./CONTRIBUTING.md) | Set up the repository and prepare a focused change. |
| [Security](./SECURITY.md) | Report a vulnerability privately and review the support policy. |

Run `runpalette --help` for the complete command and option reference.

## Project

[Changelog](./CHANGELOG.md) · [Contributing](./CONTRIBUTING.md) ·
[Security](./SECURITY.md) · [CLI guide](./docs/CLI.md) · [MIT License](./LICENSE)

Runpalette is a discovery and launch layer over commands your project already
owns. It is not another package manager, task format, or build system.
