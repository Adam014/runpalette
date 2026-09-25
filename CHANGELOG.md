# Changelog

All notable changes to Runpalette will be documented in this file.

## Unreleased

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
- Verify source, built Node and Bun artifacts, npm package contents, and a clean
  consumer installation with one concise command.
- Add a product-led README and an optimized terminal walkthrough while keeping
  repository-only marketing media out of the npm artifact.
