# Runpalette

**See every command. Find the right one. Run it without leaving your terminal.**

Runpalette turns the scripts a project already owns into one searchable,
outcome-based command palette. It detects the project and package manager,
keeps noisy lifecycle hooks out of the way, and shows the exact command before
it runs.

```text
╭──────────────────────────────────────────────────────────────╮
│ RUNPALETTE project commands, made visible                    │
│ my-app · pnpm · 12 commands                                  │
╰──────────────────────────────────────────────────────────────╯

 ⌕  test

 TEST & QUALITY
 ◆ test:unit
   test:e2e

 RUN   pnpm run test:unit
 DOES  vitest run
```

## Why Runpalette

- Start with `runpalette`; typing immediately searches.
- Browse scripts by intent instead of scanning a flat `package.json` list.
- See the chosen project, package manager, script, and delegated command before
  execution.
- Use the same catalog from a terminal, CI job, or coding agent through stable
  plain-text and JSON modes.
- Keep the project as-is: Runpalette delegates to npm, pnpm, Yarn, or Bun rather
  than introducing another task format.

## Current preview

Runpalette is under active pre-release development and is not published yet.
To try the current source checkout:

```bash
bun install
bun run build
node dist/cli.js
```

The initial command surface is deliberately small:

```bash
runpalette                       # interactive palette on a capable TTY
runpalette list                  # deterministic human-readable catalog
runpalette list --json           # versioned catalog for automation
runpalette run test              # run one exact package script
runpalette run test -- --watch   # forward arguments unchanged
runpalette run build --dry-run   # inspect without executing
```

Read the [CLI guide](docs/CLI.md) for keyboard controls, discovery rules,
automation output, and package-manager selection. Runtime and host claims are
tracked in [Compatibility](COMPATIBILITY.md).

## Principles

- Zero configuration for the first useful run.
- Project commands remain the source of truth.
- Human-friendly by default; deterministic for automation.
- No shell construction by Runpalette and no hidden command execution.
- Honest compatibility claims backed by packed-artifact tests.

## License

[MIT](LICENSE) © Adam Stádník
