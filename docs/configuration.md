# Configuration

Runpalette works without configuration. Add `runpalette.json` at the workspace
root only when the team wants clearer names, stable aliases, deliberate
ordering, or an execution safeguard around an existing package script.

Configuration changes how scripts are presented and selected. The package
manager still owns execution, so Runpalette does not duplicate script bodies or
introduce a second task format.

## Start a configuration

```json
{
  "$schema": "./node_modules/runpalette/schema/runpalette.schema.json",
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
      "confirm": "This publishes the package to the public registry."
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

Built-in group IDs are `develop`, `quality`, `build`, `operations`, and
`other`. Custom group IDs use lowercase letters, numbers, dots, underscores,
or hyphens and may define a `label` and `order` under `groups`.

## Defaults and workspace overrides

`default` selects the initial palette entry by script name or alias. In a
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
entry. Selectors accept either the package name or its root-relative path.

## Confirmations in automation

A command with `confirm` asks for `y` or `yes` in an interactive terminal.
Runpalette fails closed in CI and other non-interactive environments unless
`--yes` is present:

```bash
runpalette run release --dry-run --json
runpalette run release --non-interactive --yes
```

`--yes` approves only the configured Runpalette confirmation. It does not alter
prompts or safety behavior implemented by the underlying package script.

## Alternate configuration files

Use an explicit path when validating or temporarily testing another policy:

```bash
runpalette list --config ./runpalette.ci.json
```

Relative `--config` paths are resolved from the invocation directory. The
default file is always `runpalette.json` in the discovered project root.
