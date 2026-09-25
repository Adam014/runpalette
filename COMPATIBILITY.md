# Compatibility

Runpalette is in pre-release development. Compatibility is claimed only after
the packaged CLI passes its documented contract on that environment.

The initial implementation target is Node.js 22 or newer. Bun and Deno remain
planned runtime targets until packed-artifact tests prove them. Project scripts
will be delegated to npm, pnpm, Yarn, or Bun independently of the runtime that
executes Runpalette.

