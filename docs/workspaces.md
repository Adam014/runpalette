# Workspaces

Runpalette presents root and package scripts as one searchable command surface.
It discovers workspaces from:

- the `workspaces` array in `package.json`;
- the `workspaces.packages` array used by compatible manifests;
- the `packages` array in `pnpm-workspace.yaml`.

Positive and negative glob patterns are supported. `node_modules` and symbolic
links are not traversed. Package-manager configuration remains the source of
truth; Runpalette does not maintain a separate package list.

## Browse a monorepo

Open the palette anywhere below the workspace root:

```bash
runpalette
```

Every entry shows its owning package. Search includes the script, command
metadata, workspace name, and root-relative package path. Use Tab and Shift-Tab
to focus command groups.

Filter non-interactive output by package name or path:

```bash
runpalette list --workspace @acme/web
runpalette list --workspace packages/api --json
```

The reserved selector `root` chooses scripts from the root package.

## Run the intended package

Interactive selection already identifies one exact package. For direct
execution, a unique script name needs no extra option:

```bash
runpalette run api:generate
```

If multiple packages expose the requested name or alias, Runpalette refuses to
guess. Choose one explicitly:

```bash
runpalette run test --workspace @acme/api
runpalette run test --workspace packages/web -- --watch
runpalette run lint --workspace root
```

The selected package directory becomes the child working directory. Runpalette
still delegates through the root project's detected npm, pnpm, Yarn, or Bun
installation, preserving the repository's native script behavior.

## Automation

The versioned catalog identifies each command with workspace metadata:

```bash
runpalette list --json
runpalette run build --workspace @acme/web --dry-run --json
```

The dry-run plan includes the exact executable, argument array, working
directory, canonical script, requested alias, workspace, and safety policy.
Paths in JSON output are relative to the directory where Runpalette was
invoked, which keeps CI artifacts portable.
