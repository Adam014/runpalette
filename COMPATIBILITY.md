# Compatibility

Runpalette 0.1.x is the first public single-package release. Compatibility is
claimed only after the packed CLI passes its documented contract on that
environment.

The supported CLI runtime is Node.js 22 or newer. CI exercises the maintained
Node.js release lines on Linux, macOS, and Windows. The verification pipeline
also smoke-tests the built artifact with Bun, but Bun and Deno remain preview
runtime targets until they pass the same complete packaged-runtime contract.

Project scripts are delegated to npm, pnpm, Yarn, or Bun independently of the
runtime executing Runpalette. Execution-plan tests cover all four, and CI
installs the packed release into clean consumers through each package manager
before a release can pass.

The terminal UI has explicit plain-text, ASCII, no-color, narrow-terminal, and
non-interactive paths. Linux, macOS, and Windows run the same source, build,
test, and packed npm-consumer contract in CI.
