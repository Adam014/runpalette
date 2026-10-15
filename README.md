# Runpalette

<img src="https://raw.githubusercontent.com/Adam014/runpalette/main/docs/assets/runpalette-logo.png" width="96" height="96" alt="" align="right" />

[![npm](https://img.shields.io/npm/v/runpalette)](https://www.npmjs.com/package/runpalette)
[![CI](https://github.com/Adam014/runpalette/actions/workflows/ci.yml/badge.svg)](https://github.com/Adam014/runpalette/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](./LICENSE)

A searchable list of every command in your project.

Runpalette reads the commands a project already has (`package.json` scripts,
`justfile`, `Taskfile`, `Makefile`, Cargo aliases and Gradle tasks), puts them
in one list, and lets you type to find and run one. It doesn't add a new task
format. Your package manager or task runner still runs the command.

<img src="./docs/assets/runpalette-demo.gif" alt="Runpalette listing and searching project commands" width="800" />

## Why

Every project keeps its commands somewhere different. One has twenty scripts in
`package.json`, another has a `Makefile` and a `justfile`, a monorepo has
scripts spread over ten packages. I kept opening those files just to remember
what a command was called. Now I type `runpalette`, start typing, and press
Enter.

## Install

You need Node.js 22+. Try it without installing anything:

```sh
npx runpalette
```

Or add it to the project so the whole team has it:

```sh
npm install --save-dev runpalette
```

```json
{
  "scripts": {
    "what": "runpalette"
  }
}
```

Then `npm run what` opens the palette. pnpm, Yarn and Bun work the same way.

## Usage

```sh
runpalette                              # open the palette
runpalette list                         # print every command
runpalette run test -- --watch          # run one, pass extra arguments
runpalette run build --dry-run          # show exactly what would run
runpalette run dev --workspace @acme/web
runpalette doctor                       # check what's missing
```

In the palette, type to search, use the arrow keys to move, Tab to jump between
groups and Enter to run. Monorepos (npm, pnpm, Yarn and Bun workspaces) work
without any configuration.

If you want nicer names, descriptions, aliases or a confirmation before
`deploy`, run `runpalette config init` and edit the `runpalette.json` it
creates. See [configuration](./docs/configuration.md).

### For coding agents and CI

```sh
runpalette list --json
runpalette run test --json --timeout 2m
runpalette mcp
```

`--json` gives you one versioned JSON result on stdout and never prompts.
`runpalette mcp` starts an MCP server, so an agent can see which commands
exist instead of guessing from the README. By default it can only list and
plan commands. It can run them only if you start it with `--allow-execution`.
More in [MCP and agents](./docs/mcp.md).

## What it won't do

- It doesn't run your command through a shell. It calls the executable with
  the arguments directly.
- It doesn't replace npm, pnpm, `just`, `make` or anything else. They still
  run the command.
- It doesn't hide install hooks like `postinstall`. It just keeps them out of
  the default list.

## Docs

- [CLI guide](./docs/CLI.md)
- [Command sources](./docs/sources.md)
- [Configuration](./docs/configuration.md)
- [Workspaces](./docs/workspaces.md)
- [MCP and agents](./docs/mcp.md)
- [Shell completion](./docs/completions.md)
- [Compatibility](./COMPATIBILITY.md)

`runpalette --help` lists every command and option.

## License

[MIT](./LICENSE). [Changelog](./CHANGELOG.md) · [Contributing](./CONTRIBUTING.md) · [Security](./SECURITY.md)
