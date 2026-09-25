# Compatibility

Runpalette 0.2.x is the current public release line. Compatibility is
claimed only after the packed CLI passes its documented contract on that
environment.

The supported CLI runtime is Node.js 22 or newer. CI exercises the maintained
Node.js release lines on Linux, macOS, and Windows. The verification pipeline
also smoke-tests the built artifact with Bun, but Bun and Deno remain preview
runtime targets until they pass the same complete packaged-runtime contract.

Project scripts are delegated to npm, pnpm, Yarn, or Bun independently of the
runtime executing Runpalette. CI installs the packed release into a clean
workspace consumer through each package manager, discovers a package command,
and executes it from the selected workspace before a release can pass.

The terminal UI has explicit plain-text, ASCII, no-color, narrow-terminal, and
non-interactive paths. Linux, macOS, and Windows run the same source, build,
test, and packed npm-consumer contract in CI.
