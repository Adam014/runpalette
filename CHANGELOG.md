# Changelog

All notable changes to Runpalette will be documented in this file.

## Unreleased

## 1.0.1 - 2026-10-01

- Introduce a distinct liquid-glass Runpalette identity and integrate the new
  project mark into the public README.
- Replace the short terminal demo with a 30 FPS launch walkthrough covering
  command discovery and search, workspaces and task sources, deterministic
  dry-run plans, readiness diagnostics, and the bounded MCP surface.

## 1.0.0 - 2026-09-29

- Declare output schemas for every MCP tool and verify the complete structured
  tool surface through real clients and packed runtime contracts.
- Publish the stable 1.x CLI, configuration, JSON, MCP, and exit-code contract,
  and replace the stale pre-1.0 security support policy.

## 0.9.0 - 2026-09-29

- Add declarative per-command environment and executable requirements with
  safe general/workspace inheritance, JSON Schema support, and no secret-value
  exposure.
- Expose requirement readiness in terminal, JSON, and MCP plans; summarize
  unavailable commands in project diagnostics and fail actual execution before
  launch when an explicit prerequisite is missing.

## 0.8.0 - 2026-09-29

- Add a read-only `check_project` MCP preflight tool that reuses Runpalette's
  doctor and configuration-validation models, exposes a declared structured
  output schema, and reports project readiness before an agent plans work.
- Mark project preflight as read-only, non-destructive, idempotent, and
  closed-world, and verify it through real MCP clients across packed Node, Bun,
  and Deno runtime contracts.

## 0.7.0 - 2026-09-29

- Add safe `config init` onboarding with an exact-version JSON Schema link,
  explicit overwrite protection, alternate-path support, and structured JSON
  output.
- Add `config validate` for structural and catalog-aware checks, including
  non-blocking warnings for stale command selectors, plus shell completion and
  packed runtime coverage for the new workflow.

## 0.6.0 - 2026-09-29

- Expand the human `run --dry-run` result into a focused command explanation
  with source, workspace, directory, safety policy, package manager, and exact
  delegated invocation while keeping the existing versioned JSON plan stable.
- Make repeated Gradle command discovery substantially faster by respecting
  Gradle's standard project daemon policy instead of forcing a disposable JVM
  for every catalog load.

## 0.5.0 - 2026-09-29

- Add `runpalette doctor` with human and versioned JSON reports for project,
  catalog, package-manager, configuration, and command-source readiness.
- Return a blocking exit status only when the discovered command surface is
  unusable while keeping optional-source warnings automation-friendly.
- Generate Bash, Zsh, Fish, and PowerShell completion scripts with dynamic
  candidates from the current project's command names and aliases.
- Add complete packed-artifact runtime contracts for Bun and Deno covering
  discovery, doctor, planning, captured execution, completion, and MCP, and
  enforce them independently in CI.

## 0.4.1 - 2026-09-28

- Clarify that bounded JSON and MCP execution intentionally disable child
  stdin and that interactive tasks should use native stream mode.
- Correct the npm README and compatibility guide to identify `0.4.x` as the
  current supported release line.

## 0.4.0 - 2026-09-28

- Make captured command execution cancellation-safe, terminate owned process
  trees when an MCP request is cancelled, and return timing plus precise output
  budget metadata in the structured result.
- Add actual `run NAME --json` execution for CI and agents with bounded stdout
  and stderr, optional human-readable timeouts, preserved child exit status,
  and the same confirmation policy as interactive execution.

## 0.3.0 - 2026-09-27

- Discover one normalized command catalog across package scripts, Justfiles,
  Taskfiles, public Make targets, project-owned Cargo aliases, and Gradle tasks.
- Support projects without `package.json` and make command-source collisions
  explicit through `--source` and source metadata in human and JSON output.
- Add a provider-neutral MCP stdio server with read-only catalog and planning
  tools by default.
- Gate MCP execution behind the server-level `--allow-execution` opt-in,
  preserve configured confirmations per call, and bound execution time and
  captured output.
- Surface missing optional source tools as actionable diagnostics without
  hiding commands discovered from other project sources.

## 0.2.2 - 2026-09-26

- Return help through the versioned result envelope when `--help --json` is
  requested, matching every other machine-readable result.
- Keep help output ASCII-only when Unicode rendering is disabled.

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
