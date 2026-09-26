# Changelog

All notable changes to Runpalette will be documented in this file.

## Unreleased

## 0.2.1 - 2026-09-26

- Make `--no-unicode`, `--unicode=never`, and `TERM=dumb` use ASCII-only UI
  chrome in plain output, the interactive palette, truncation, and confirmation
  prompts.
- Honor `--color=always` for redirected plain catalogs while preserving
  color-free automatic, `NO_COLOR`, and machine-readable output.

## 0.2.0 - 2026-09-25

- Discover root and package commands across npm, pnpm, Yarn, and Bun
  workspaces, with explicit selection when names are ambiguous.
- Add optional, schema-validated `runpalette.json` metadata for labels,
  descriptions, groups, ordering, aliases, defaults, hidden entries, and
  confirmations.
- Add group filtering in the interactive palette with Tab and Shift-Tab plus
  `--group` and `--workspace` filters for direct and automated use.
- Require an explicit interactive answer or `--yes` before protected commands
  run, while preserving a reviewable dry-run path.
- Return short, ranked suggestions for unknown commands instead of dumping the
  entire project catalog.
- Add focused configuration and workspace guides and ship the public JSON
  schema in the npm package.
- Enforce over 90% line and function coverage, publish LCOV results to Codecov,
  and validate packed workspace consumers through all four package managers.
- Add public contribution and security policies and make them discoverable
  from the project README.

## 0.1.0 - 2026-09-25

- Establish a portable TypeScript CLI foundation without runtime dependencies.
- Discover the nearest package project and resolve npm, pnpm, Yarn, or Bun from
  explicit input, project metadata, and lockfiles.
- Group package scripts by outcome while hiding automatic lifecycle hooks and
  recursive Runpalette aliases.
- Add a searchable, keyboard-driven terminal palette with narrow, ASCII,
  no-color, and non-interactive fallbacks.
- Add deterministic `list`, exact `run`, forwarded arguments, `--dry-run`, and
  versioned JSON output for automation.
- Delegate execution without constructing a shell command and preserve child
  exit codes.
- Launch package-manager shims correctly on Windows while preserving argument
  arrays and native child streams.
- Verify source, built Node and Bun artifacts, npm package contents, and a clean
  consumer installation with one concise command.
- Add a product-led README and an optimized terminal walkthrough while keeping
  repository-only marketing media out of the npm artifact.
- Add cross-platform CI, package-manager consumer checks, and an OIDC-ready npm
  release workflow.
