# Compatibility

Runpalette 0.9.x is the current public release line. Compatibility is claimed
only after the packed CLI passes its documented contract on that environment.

The supported `0.9.x` CLI runtimes are Node.js 22 or newer, Bun 1.3, and Deno
2.9. The packed artifact passes discovery, doctor, planning, captured
execution, completion, and MCP checks under each runtime. CI exercises the
maintained Node.js release lines on Linux, macOS, and Windows and runs the
complete packaged-runtime contract with pinned Bun and Deno versions on Linux.

Runtime selection does not change project package-manager selection:

```bash
# Node.js
npx runpalette

# Bun
bunx --bun runpalette

# Deno
deno run --allow-read --allow-env --allow-run --allow-sys npm:runpalette
```

Deno permissions allow Runpalette to inspect the project, read environment
needed by owning tools, launch those tools, and manage owned child processes.
Runpalette does not require network permission after Deno has resolved the npm
package.

Creating a configuration is the only Runpalette workflow that writes to the
project. Under Deno, grant that permission only for the initialization call:

```bash
deno run --allow-read --allow-write --allow-env --allow-run --allow-sys npm:runpalette config init
```

Project scripts are delegated to npm, pnpm, Yarn, or Bun independently of the
runtime executing Runpalette. CI installs the packed release into a clean
workspace consumer through each package manager, discovers a package command,
and executes it from the selected workspace before a release can pass.

The terminal UI has explicit plain-text, ASCII, no-color, narrow-terminal, and
non-interactive paths. Linux, macOS, and Windows run the same source, build,
test, and packed npm-consumer contract in CI. Bun and Deno support currently
has Linux CI evidence plus local macOS arm64 verification; broader runtime/host
matrix evidence will be added without blocking compatible hosts in code.

## Command sources

| Source | Discovery contract | Execution owner |
| --- | --- | --- |
| `package.json` | root and workspace `scripts` | detected npm, pnpm, Yarn, or Bun |
| Just | `just --dump --dump-format json` | `just` |
| Task | `task --list-all --json` | `task` |
| Make | static `.PHONY` and `##`-documented targets | `make` |
| Cargo | project aliases from `.cargo/config.toml` or `.cargo/config` | `cargo` |
| Gradle | wrapper-preferred `tasks --all` metadata | project wrapper or `gradle` |

Make discovery never evaluates the Makefile. Just, Task, and Gradle use their
native metadata commands and therefore require the corresponding executable.
Runpalette reports a diagnostic when an optional tool is unavailable and keeps
commands from every other source usable. See [Command sources](./docs/sources.md)
for exact behavior and trust guidance.
