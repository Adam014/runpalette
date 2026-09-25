# Contributing to Runpalette

Thank you for helping make project commands easier to discover and run.

## Before opening a change

- Search existing issues and pull requests.
- Describe the user problem and keep the proposed change focused.
- Preserve the scripts and package-manager behavior a project already owns.
- Never commit credentials, private repository data, or unrelated project
  files from a test fixture.

## Local setup

Runpalette uses Bun for repository dependency management and contributor
commands. The published CLI must remain portable on every advertised Node.js
version and host platform.

```bash
git clone https://github.com/Adam014/runpalette.git
cd runpalette
bun install --frozen-lockfile
bun run verify
```

Useful focused commands:

```bash
bun run dev -- --help
bun run typecheck
bun run lint
bun run test
```

## Implementation expectations

- Keep command discovery deterministic and preserve unknown scripts rather than
  silently discarding them.
- Build process launches from an executable and argument array; do not
  construct an implicit shell command.
- Keep JSON output versioned, prompt-free, and free of terminal decoration.
- Preserve interactive, redirected, no-color, ASCII, narrow-terminal, and
  non-interactive behavior.
- Add focused tests for discovery, grouping, search, planning, execution, and
  every platform-sensitive change.
- Update public documentation and the changelog with user-facing behavior.

## Pull requests

Keep commits reviewable and explain the user-visible outcome, compatibility
impact, and verification performed. `bun run verify` must pass before review.

By contributing, you agree that your contributions are licensed under the
[MIT License](./LICENSE).
