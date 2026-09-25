# Runpalette CLI

Runpalette discovers the nearest `package.json`, turns its scripts into one
consistent catalog, and delegates execution to the project's package manager.
It does not replace the package manager or reinterpret a script.

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
| `Backspace` | Edit the search |
| `Ctrl-U` | Clear the search |
| `Enter` | Run the selected command |
| `Esc` | Clear search first; close on the next press |
| `?` | Toggle keyboard help |
| `Ctrl-C` | Close and return exit code 130 |

Runpalette restores the normal terminal before the selected command starts, so
the child receives the ordinary stdin, stdout, and stderr streams.

## List and run directly

```bash
runpalette list
runpalette run test
runpalette run test -- --watch --coverage
```

Everything after `--` is passed to the package script. npm receives its required
separator; pnpm, Yarn, and Bun receive the arguments in their native form.

Preview the resolved invocation without running it:

```bash
runpalette run build --dry-run
runpalette run build --dry-run --json
```

## Project and package-manager selection

Discovery begins at the current directory and walks upward to the nearest
`package.json`. Choose another starting point with:

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

## Automation and agents

`--json` implies non-interactive mode and writes one JSON object to stdout.
Diagnostics remain on stderr. Every result includes a `schemaVersion` and an
explicit `ok` value.

```bash
runpalette list --json
runpalette run test --dry-run --json -- --watch
```

Actual command execution currently uses human stream mode. Combine `--json`
with `--dry-run` when an agent or CI job needs an execution plan without side
effects.

## Terminal fallbacks

When stdin or stderr is not a TTY, no-argument Runpalette prints the same
catalog without opening a prompt. These options make rendering explicit:

```bash
runpalette list --no-color --no-unicode
runpalette list --non-interactive
runpalette --color=always --unicode=always
```

`NO_COLOR` and `TERM=dumb` are respected in automatic mode.
