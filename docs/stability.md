# Stability and versioning

Runpalette 1.x follows semantic versioning for its documented public surfaces.
The stable contract covers the CLI, configuration schema, machine-readable JSON,
and MCP tools described below. Fixes may change incorrect behavior, diagnostics,
performance, and human presentation without changing the intended contract.

## CLI contract

Documented command names, option meanings, argument forwarding, and exit
behavior remain compatible throughout 1.x. New commands and optional flags may
be added in a minor release. A documented command or option is not removed or
repurposed without a major release; when practical, it is deprecated first.

Exit behavior is:

| Exit | Meaning |
| --- | --- |
| `0` | Successful command, successful inspection, or user cancellation before launch |
| `1` | Unexpected internal Runpalette failure |
| `2` | Invalid input, discovery/configuration failure, ambiguity, or blocked policy/preflight |
| child exit | A launched project command completed with its own non-zero exit code |
| `124` | Captured execution reached its explicit timeout |
| `128 + signal` | Runpalette or its owned child was interrupted by a signal |

Human text, color, Unicode decoration, spacing, and interactive layout are not
byte-stable APIs. Automation must use `--json`, MCP, or documented exit codes.

## Configuration schema

`runpalette.json` uses `schemaVersion: 1`. Unknown fields are rejected so a
misspelled policy cannot silently change behavior. Compatible 1.x releases may
add optional fields; they do not remove fields, weaken validation, or reinterpret
existing values. An incompatible configuration change requires a new schema
version and an explicit migration path.

Pin `$schema` to the installed package version, as `runpalette config init`
does, when reproducible editor validation matters.

## JSON contract

JSON commands emit one object on stdout and keep human diagnostics on stderr.
The top-level success envelope contains `schemaVersion: 1`, `ok`, `command`,
`data`, and `warnings`; failures contain `schemaVersion: 1`, `ok: false`, and a
structured `error` with `code`, `message`, and nullable `hint`.

Catalogs, plans, doctor reports, configuration reports, and execution results
are versioned structures. Runpalette 1.x may add fields but does not remove or
repurpose documented fields under schema version 1. Consumers should ignore
unknown fields and use names rather than object-property order.

## MCP contract

Every MCP tool declares input and output schemas and returns structured,
schema-versioned content. The default 1.x tools are `check_project`,
`list_commands`, and `plan_command`; they remain read-only. `run_command`
exists only when the server is launched with `--allow-execution` and continues
to enforce configured confirmation, requirement, timeout, and output policies.

Compatible 1.x releases may add optional input fields or new tools. Removing a
tool, changing an existing field's meaning, enabling execution by default, or
weakening a safety boundary requires a major release.

## Compatibility evidence

Runtime, operating-system, package-manager, and command-source support is
claimed only at the tier documented in [Compatibility](../COMPATIBILITY.md).
An upstream environment may become unavailable independently; Runpalette keeps
portable paths open and updates evidence rather than silently blocking it.
