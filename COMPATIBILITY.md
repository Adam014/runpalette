# Compatibility

Runpalette is in pre-release development. Compatibility is claimed only after
the packaged CLI passes its documented contract on that environment.

The initial implementation target is Node.js 22 or newer. The local verification
pipeline also exercises the built artifact with Bun, but Bun and Deno remain
planned public runtime targets until the packed artifact passes the documented
CI matrix.

Project scripts are delegated to npm, pnpm, Yarn, or Bun independently of the
runtime executing Runpalette. Execution-plan tests currently cover all four;
end-to-end installation matrices will be published before package-manager
support is promoted from preview.

The terminal UI has explicit plain-text, ASCII, no-color, narrow-terminal, and
non-interactive paths. Host support claims will be added only after macOS,
Linux, and Windows runners pass the same packaged-consumer contract.
