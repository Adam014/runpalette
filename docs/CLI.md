# Runpalette CLI

Runpalette discovers the nearest supported project, turns its existing command
sources into one consistent catalog, and delegates execution to the owning
tool. It does not replace a package manager or task runner.

## Open the palette

Run this anywhere inside a project:

```bash
runpalette
```

The header confirms the selected project and package manager. Commands are
grouped into development, quality, build/release, data/operations, and a safe
fallback group. The inspector below the list always shows what the selected
entry will run.

Keyboard controls:

| Key | Action |
| --- | --- |
| Type | Search command names and script contents immediately |
| `↑` / `↓` | Move the selection |
| `Ctrl-N` / `Ctrl-P` | Move without arrow keys |
| `Tab` / `Shift-Tab` | Cycle through command-group filters |
| `Backspace` | Edit the search |
| `Ctrl-U` | Clear the search |
| `Enter` | Run the selected command |
| `Esc` | Clear search first; close on the next press |
| `?` | Toggle keyboard help |
| `Ctrl-C` | Close and return exit code 130 |

Runpalette restores the normal terminal before the selected command starts, so
the child receives the ordinary stdin, stdout, and stderr streams.

## Check project readiness

Use `doctor` when onboarding a repository, preparing CI, or diagnosing why a
command source is incomplete:

```bash
runpalette doctor
runpalette doctor --json
```

The report validates project discovery, the runnable command catalog, the
selected package manager and its executable, optional configuration, and
native source diagnostics. It also summarizes hidden, protected, and ambiguous
commands without executing project code.

Warnings such as a missing optional source tool keep exit code `0`, because
other discovered commands remain usable. A blocker such as an empty catalog or
missing selected package manager returns exit code `2`. In JSON mode the same
state is available as `data.status`; top-level `ok` is `false` for a blocking
report. Output paths are relative to the invoking directory.

## Enable shell completion

Generate a completion script for Bash, Zsh, Fish, or PowerShell:

```bash
runpalette completion bash
runpalette completion zsh
runpalette completion fish
runpalette completion powershell
```

The generated integration completes the Runpalette command surface and reads
project command names and aliases dynamically when completing `runpalette run`.
Runpalette only writes the generated script to stdout and never modifies shell
configuration. See [Shell completion](./completions.md) for temporary and
persistent installation commands.

## List and run directly

```bash
runpalette list
runpalette list --group quality
runpalette list --workspace @acme/web
runpalette list --source just
runpalette run test
runpalette run verify --source make
runpalette run dev --workspace @acme/web
runpalette run test -- --watch --coverage
```

Everything after `--` is passed as an argument array to the owning tool without
shell interpolation. Source-specific separators are added only when required.

Preview the resolved invocation without running it:

```bash
runpalette run build --dry-run
runpalette run build --dry-run --json
```

The human dry-run explains the selected command's source, workspace, working
directory, safety requirement, package manager, and exact delegated command.
The JSON form exposes the same versioned plan as structured data for agents and
CI.

## Project and package-manager selection

Discovery begins at the current directory and walks upward to the nearest
supported project marker. Choose another starting point with:

```bash
runpalette --cwd ../another-project
```

Package-manager precedence is:

1. `--package-manager npm|pnpm|yarn|bun`
2. the manifest's `packageManager` field
3. a recognized lockfile
4. npm as the portable fallback

Conflicting lockfiles produce a visible warning. Override the decision when the
repository intentionally differs:

```bash
runpalette --package-manager pnpm
```

## Workspaces and command ambiguity

Runpalette discovers package scripts declared by npm, Yarn, and Bun
`workspaces`, plus package patterns in `pnpm-workspace.yaml`. The palette shows
the owning package and runs a selection from that workspace directory.

When the same script name exists in multiple packages, direct execution is
intentionally rejected until the package is explicit:

```bash
runpalette run test --workspace @acme/api
runpalette run test --workspace packages/web
```

Use `root` to select the root package. See [Workspaces](./workspaces.md) for the
complete behavior.

## Project configuration

Zero-config discovery remains the default. A checked-in `runpalette.json` can
add presentation and safety policy without creating another task format:

```bash
runpalette config init
runpalette config validate
```

`config init` creates the minimal file at the discovered project root and
links its JSON Schema to the exact installed Runpalette version. It refuses to
replace an existing file unless `--force` is explicit. `config validate`
checks the complete syntax, aliases, defaults, and catalog semantics; it also
reports configured command selectors that do not match the current project.
Both commands support `--json` for setup automation.

```json
{
  "$schema": "./node_modules/runpalette/schema/runpalette.schema.json",
  "schemaVersion": 1,
  "default": "serve",
  "commands": {
    "dev": {
      "label": "Start the app",
      "description": "Launch the local frontend",
      "aliases": ["serve"]
    },
    "release": {
      "confirm": "This publishes a public package."
    }
  }
}
```

Protected commands prompt interactively. Automation must first inspect the
dry-run plan and then opt in explicitly with `--yes`:

```bash
runpalette run release --dry-run
runpalette run release --non-interactive --yes
```

See [Configuration](./configuration.md) for every field and workspace-specific
overrides.

## Command sources

Package scripts, Justfiles, Taskfiles, public Make targets, project Cargo
aliases, and Gradle tasks can share one catalog. When two sources own the same
name, direct execution fails closed until the source is explicit:

```bash
runpalette list --source gradle
runpalette run test --source gradle
```

See [Command sources](./sources.md) for discovery rules and native tool
requirements.

## Automation and agents

`--json` implies non-interactive mode and writes one JSON object to stdout.
Diagnostics remain on stderr. Every result includes a `schemaVersion` and an
explicit `ok` value.

Help and version queries follow the same envelope when `--json` is present:

```bash
runpalette --help --json
runpalette --version --json
```

```bash
runpalette list --json
runpalette run test --dry-run --json -- --watch
runpalette run test --json --timeout 2m --max-output 2MiB
```

Use `--dry-run --json` for a side-effect-free execution plan. Without
`--dry-run`, JSON mode executes the resolved catalog command without a shell
and returns the plan plus a bounded execution result. It captures a combined
1 MiB by default; `--max-output` accepts `B`, `KB`, `KiB`, `MB`, or `MiB` up to
16 MiB. There is no hidden execution timeout. Add `--timeout` explicitly with
`ms`, `s`, `m`, or `h` when the caller needs one.

The structured result preserves timestamps, duration, child exit status,
signal, stdout and stderr, observed byte counts, timeout, cancellation, and
per-stream truncation. Runpalette returns the child's exit code, `124` for a
timeout, and the conventional signal exit code when interrupted. Protected
commands still require `--yes`; JSON mode never opens a prompt and gives the
child no stdin. Use ordinary non-JSON execution when a task needs interactive
input.

For a native agent interface, `runpalette mcp` starts an MCP stdio server with
read-only project preflight, catalog, and planning tools. See
[MCP and agents](./mcp.md).

## Terminal fallbacks

When stdin or stderr is not a TTY, no-argument Runpalette prints the same
catalog without opening a prompt. These options make rendering explicit:

```bash
runpalette list --no-color --no-unicode
runpalette list --non-interactive
runpalette --color=always --unicode=always
```

`NO_COLOR` and `TERM=dumb` are respected in automatic mode.

## Complete option reference

```text
--cwd PATH                 Start project discovery at PATH
--workspace NAME_OR_PATH   Limit listing or choose a package for execution
--group ID                 Limit listing and the palette to one command group
--source NAME              Select package, just, task, make, cargo, or gradle
--config PATH              Read an explicit Runpalette JSON configuration
--package-manager NAME     Use npm, pnpm, yarn, or bun explicitly
--allow-execution          Add run_command to the MCP server
--force                    Replace an existing file during config init only
--dry-run                  Print the resolved execution plan without running
--timeout DURATION         Bound captured JSON execution (1ms to 24h)
--max-output SIZE          Bound captured JSON output (default 1MiB, max 16MiB)
--yes, -y                  Approve a configured confirmation non-interactively
--json                     Emit one versioned JSON result; implies non-interactive
--non-interactive          Disable terminal prompts and palette rendering
--color=auto|always|never  Control ANSI color
--unicode=auto|always|never Control Unicode drawing characters
--no-color                 Disable ANSI color
--no-unicode               Use ASCII-only rendering
-h, --help                 Show help
-V, --version              Show version
```
