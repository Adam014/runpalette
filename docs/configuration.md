# Configuration

Runpalette works without configuration. Add `runpalette.json` at the workspace
root only when the team wants clearer names, stable aliases, deliberate
ordering, or an execution safeguard around an existing project command.

Configuration changes how commands are presented and selected. The original
package manager or task tool still owns execution, so Runpalette does not
duplicate command bodies or introduce a second task format.

## Start a configuration

Create a minimal configuration at the discovered project root:

```bash
runpalette config init
```

The generated `$schema` URL is pinned to the installed Runpalette version so
editors can complete and validate fields against the same contract as the CLI.
The command refuses to overwrite an existing file. Use `--force` only when
replacement is deliberate, or `--config PATH` to create an alternate file.

Validate the file against both its schema contract and the repository's
currently discovered command surface:

```bash
runpalette config validate
runpalette config validate --json
```

A malformed file, conflicting alias, or invalid default fails with exit code
`2`. Stale command selectors are reported as warnings with exit code `0`: the
configuration remains usable, but those entries currently affect nothing.

Then add only the metadata the team needs:

```json
{
  "$schema": "https://unpkg.com/runpalette@1.0.2/schema/runpalette.schema.json",
  "schemaVersion": 1,
  "default": "serve",
  "groups": {
    "shipping": {
      "label": "Ship safely",
      "order": 300
    }
  },
  "commands": {
    "dev": {
      "label": "Start the app",
      "description": "Launch the local development server",
      "aliases": ["serve"],
      "order": 10
    },
    "release": {
      "group": "shipping",
      "confirm": "This publishes the package to the public registry.",
      "requires": {
        "environment": ["NPM_TOKEN"],
        "executables": ["npm"]
      }
    },
    "internal:fixture": {
      "hidden": true
    }
  }
}
```

Runpalette validates the complete file and rejects unknown fields. A malformed
policy never degrades silently into a different command surface.

## Command fields

| Field | Type | Effect |
| --- | --- | --- |
| `label` | non-empty string | Human-readable name in the palette and plain list |
| `description` | non-empty string | Short explanation shown while the command is selected |
| `group` | group ID | Moves the command into a built-in or custom group |
| `order` | finite number | Sorts the command inside its group; lower values appear first |
| `hidden` | boolean | Removes the command from discovery and direct Runpalette execution |
| `aliases` | unique string array | Adds stable alternative names for direct execution and defaults |
| `confirm` | boolean or string | Requires approval; a string becomes the warning shown to the user |
| `requires.environment` | unique string array | Environment variable names that must be present before execution |
| `requires.executables` | unique string array | External executables that must be available on `PATH` before execution |

Built-in group IDs are `develop`, `quality`, `build`, `operations`, and
`other`. Custom group IDs use lowercase letters, numbers, dots, underscores,
or hyphens and may define a `label` and `order` under `groups`.

## Defaults and workspace overrides

`default` selects the initial palette entry by command name or alias. In a
monorepo, qualify an ambiguous default as `workspace#script`:

```json
{
  "schemaVersion": 1,
  "default": "@acme/web#serve",
  "commands": {
    "test": {
      "description": "Run package tests"
    },
    "@acme/web#test": {
      "label": "Test the web app"
    },
    "packages/api#test": {
      "label": "Test the API"
    }
  }
}
```

A workspace override inherits unspecified fields from the general script
entry, including individual `requires` arrays. Selectors accept either the
package name or its root-relative path.

General command metadata also applies to matching names discovered from
non-package sources. If the same name exists in multiple sources, keep the
palette default unambiguous and use `--source` for direct execution.

## Confirmations in automation

A command with `confirm` asks for `y` or `yes` in an interactive terminal.
Runpalette fails closed in CI and other non-interactive environments unless
`--yes` is present:

```bash
runpalette run release --dry-run --json
runpalette run release --json --yes --timeout 10m
runpalette run release --non-interactive --yes
```

`--yes` approves only the configured Runpalette confirmation. It does not alter
prompts or safety behavior implemented by the underlying project command.

## Command requirements

Requirements are explicit preflight checks, not values managed by Runpalette.
The tool checks whether each named environment variable exists and whether each
executable resolves from the current `PATH`. It never reads requirement values
into output, loads `.env` files, installs tools, or infers requirements from a
command string.

Review readiness without running the command:

```bash
runpalette run release --dry-run
runpalette run release --dry-run --json
```

Human plans identify missing names; JSON and MCP plans return `requirements`
and `readiness` objects. Actual terminal, JSON, and MCP execution fails before
launch with `COMMAND_REQUIREMENTS_UNMET` when an explicit prerequisite is
missing. An empty environment value counts as present, matching ordinary
process-environment semantics.

## Alternate configuration files

Use an explicit path when validating or temporarily testing another policy:

```bash
runpalette list --config ./runpalette.ci.json
```

Relative `--config` paths are resolved from the invocation directory. The
default file is always `runpalette.json` in the discovered project root.
