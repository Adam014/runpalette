# Command sources

Runpalette presents commands from the tools a repository already uses. It does
not copy task bodies into another configuration format, and the owning tool
still performs execution.

## Supported sources

| Source | Files | What becomes visible | Native invocation |
| --- | --- | --- | --- |
| Package scripts | `package.json` | non-lifecycle root and workspace scripts | detected package manager |
| Just | `justfile`, `Justfile`, `.justfile` | public recipes, including qualified module recipes | `just RECIPE` |
| Task | common `Taskfile.yml` / `.yaml` names, including `.dist` | tasks returned by Task's JSON listing | `task TASK -- ARGS` |
| Make | `GNUmakefile`, `Makefile`, `makefile` | explicit `.PHONY` targets and targets documented with `##` | `make TARGET` |
| Cargo | `.cargo/config.toml`, `.cargo/config` | project-defined `[alias]` entries | `cargo ALIAS` |
| Gradle | settings or build files | tasks returned by the wrapper-preferred all-task listing | `gradlew TASK` or `gradle TASK` |

Runpalette intentionally does not invent generic Cargo commands or expose every
Make rule. The catalog contains project-owned entry points rather than guesses.

## Mixed projects and collisions

All detected sources share the same groups and search surface. Source labels
appear when a project has more than one source. Filter the catalog or resolve a
same-name collision explicitly:

```bash
runpalette list --source package
runpalette list --source gradle
runpalette run test --source package
runpalette run test --source gradle
```

Direct execution fails closed when the command name or alias still identifies
more than one source or workspace.

## Missing native tools

Just, Task, and Gradle discovery uses the corresponding native metadata
command. If that executable is missing or metadata discovery fails, Runpalette
prints an actionable diagnostic and keeps commands from all other sources
available. Gradle prefers the project wrapper when present.

Gradle discovery follows the project's normal daemon policy instead of forcing
a disposable JVM for every palette opening. Runpalette still disables build
scan publication and requests quiet, plain task metadata. Projects that disable
the daemon in `gradle.properties` keep that choice.

Make and Cargo alias discovery are static. Reading a Makefile never runs Make.

## Trust boundary

Only use Runpalette in repositories you trust. Just, Task, and Gradle own their
metadata behavior; asking those tools to describe a project may evaluate
imports, variables, plugins, or build configuration with the current user's
permissions. Runpalette bounds discovery time and output, but it is not a
repository sandbox.

Before running an unfamiliar command, inspect its exact executable, arguments,
working directory, source, and configured safety policy:

```bash
runpalette run COMMAND --source SOURCE --dry-run --json
```

## Arguments and exit codes

Everything after `--` is forwarded as separate arguments without shell
interpolation. Runpalette adds a native separator only for sources that require
one. The owning tool's stdout, stderr, terminal access, and exit code remain
unchanged during normal CLI execution.
