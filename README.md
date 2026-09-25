<div align="center">

# Runpalette

**The command palette for every project.**

Turn the scripts your repository already owns into one searchable command
surface—for developers, coding agents, and CI.

[![JSON automation](https://img.shields.io/badge/automation-versioned_JSON-0891b2)](./docs/CLI.md#automation-and-agents)
[![Node.js](https://img.shields.io/badge/Node.js-%E2%89%A522-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![Package managers](https://img.shields.io/badge/delegates-npm_%C2%B7_pnpm_%C2%B7_Yarn_%C2%B7_Bun-64748b)](./COMPATIBILITY.md)
[![Dependencies](https://img.shields.io/badge/runtime_dependencies-0-22c55e)](./package.json)
[![License](https://img.shields.io/badge/license-MIT-64748b)](./LICENSE)

[Quick start](#quick-start) · [What it does](#what-runpalette-does) ·
[Automation](#for-agents-and-automation) · [How it works](#one-project-one-command-surface) ·
[Documentation](#documentation)

<img src="./docs/assets/runpalette-demo.gif" alt="Runpalette discovers project commands, filters them instantly, runs the selected test through pnpm, and returns a machine-readable dry-run plan." width="1120" />

</div>

## Quick start

Runpalette is currently a source preview and is not published to npm yet. Build
the CLI once, then point it at any JavaScript project:

```bash
git clone git@github.com:Adam014/runpalette.git
cd runpalette
bun install
bun run build
node dist/cli.js --cwd ../your-project
```

Runpalette finds the nearest `package.json`, detects the project package
manager, and opens an immediate type-to-search palette. Nothing needs to be
copied into the target project and Runpalette does not introduce a new task
format.

## What Runpalette does

- **Find the project** — walk upward from the current directory or an explicit
  `--cwd` and confirm the selected repository before anything runs.
- **Make commands scannable** — group existing scripts into development,
  quality, build/release, data/operations, and a conservative fallback group.
- **Search immediately** — type any part of a script name or implementation;
  use arrows or `Ctrl-N` / `Ctrl-P` to move and Enter to run.
- **Show the exact action** — keep the detected package manager, delegated
  command, and underlying script visible while selecting.
- **Delegate faithfully** — let npm, pnpm, Yarn, or Bun execute the script so
  local binaries, lifecycle behavior, arguments, and exit codes remain native.
- **Serve automation too** — expose the same catalog and execution plans as
  versioned JSON without terminal decoration or hidden side effects.

## Choose how you work

### From your terminal

Open the palette from anywhere inside a project:

```bash
runpalette
```

Or skip the interface when you already know the script:

```bash
runpalette list
runpalette run test:unit
runpalette run test:unit -- --watch
runpalette run build --dry-run
```

The palette uses an alternate terminal screen and restores the normal terminal
before the selected task starts. The child then receives ordinary stdin,
stdout, and stderr instead of running inside a simulated console.

[Learn the keyboard and command surface →](./docs/CLI.md)

### For agents and automation

Give a coding agent or CI job a stable inventory instead of asking it to infer
commands from documentation:

```bash
runpalette list --json
runpalette run test:e2e --dry-run --json
```

`--json` implies non-interactive behavior and writes one versioned result to
stdout. Diagnostics stay on stderr. A dry run returns the exact executable,
argument array, working directory, selected script, and package-manager choice
without executing the task.

Actual task execution deliberately keeps native streams and preserves the
child's exit code:

```bash
runpalette run verify --non-interactive
```

[Use Runpalette from scripts and agents →](./docs/CLI.md#automation-and-agents)

## One project. One command surface.

```text
start anywhere inside a project
        ↓
find the nearest package.json
        ↓
resolve package manager with visible evidence
        ↓
normalize and group existing scripts
        ↓
search or select one exact command
        ↓
preview the execution plan or delegate it unchanged
```

- Automatic install and publishing hooks stay out of the default palette.
- Unknown scripts remain visible instead of being silently discarded.
- Conflicting lockfiles produce a warning and deterministic selection.
- Script names and metadata are sanitized before terminal rendering.
- No-argument use outside a TTY prints a deterministic plain catalog and never
  attempts to prompt.
- `NO_COLOR`, `TERM=dumb`, ASCII rendering, narrow terminals, and explicit
  non-interactive operation have first-class paths.

## Keep your existing stack

| Command source | Package managers | CLI runtime | Interfaces |
| --- | --- | --- | --- |
| `package.json` scripts | npm · pnpm · Yarn · Bun | Node.js 22+ | interactive TTY · plain text · JSON |

Package-manager choice is independent from the runtime executing Runpalette.
The current preview targets Node.js 22 or newer; additional runtimes and hosts
will be promoted only after the packaged CLI passes their documented test
contract.

[See current compatibility evidence →](./COMPATIBILITY.md)

## Predictable by default

- Runpalette constructs an executable plus argument array; it does not build a
  shell command around your selection.
- The detected project root becomes the task working directory.
- npm's argument separator is added only where npm requires it.
- A missing script or package-manager executable returns an actionable error.
- Machine output is schema-versioned, prompt-free, and free of ANSI styling.
- Marketing media, private product research, fixtures, and development context
  are excluded from the npm artifact.
- The packaged-consumer check installs the generated tarball into a clean
  project and launches the installed CLI before verification can pass.

## Documentation

| Guide | Start here when you want to… |
| --- | --- |
| [CLI guide](./docs/CLI.md) | Search, navigate, run scripts, pass arguments, or use JSON. |
| [Compatibility](./COMPATIBILITY.md) | Check runtimes, package managers, terminals, and support status. |
| [Changelog](./CHANGELOG.md) | Review user-visible additions and behavior changes. |

Run `runpalette --help` for the complete command and option reference.

## Project

[Changelog](./CHANGELOG.md) · [CLI guide](./docs/CLI.md) ·
[MIT License](./LICENSE)

Runpalette is a discovery and launch layer over commands your project already
owns. It is not another package manager, task format, or build system.
