export const HELP = `Runpalette — project commands, made visible

Usage:
  runpalette                     Open the interactive command palette
  runpalette list                List discovered commands
  runpalette doctor              Validate project command readiness
  runpalette run NAME [-- ARGS]  Run one project command
  runpalette mcp                 Serve read-only MCP tools over stdio

Options:
  --cwd PATH                     Start project discovery from PATH
  --workspace NAME              Limit listing or execution to one workspace
  --group ID                    Limit listing or the palette to one group
  --source NAME                 Use package, just, task, make, cargo, or gradle
  --config PATH                 Use an explicit runpalette.json file
  --package-manager NAME         Use npm, pnpm, yarn, or bun
  --allow-execution              Add the opt-in MCP run_command tool
  --json                         Emit one machine-readable JSON result
  --non-interactive              Never open a prompt
  --dry-run                      Show the exact execution plan
  --timeout DURATION             Bound JSON execution, for example 30s or 5m
  --max-output SIZE              Bound captured JSON output (default 1MiB)
  -y, --yes                      Approve a configured confirmation non-interactively
  --color=MODE                   auto, always, or never
  --unicode=MODE                 auto, always, or never
  --no-color                     Alias for --color=never
  --no-unicode                   Alias for --unicode=never
  -h, --help                     Show help
  -V, --version                  Show version

Examples:
  runpalette
  runpalette list --json
  runpalette list --source make
  runpalette doctor --json
  runpalette run test -- --watch
  runpalette run verify --source make
  runpalette run test --workspace @acme/api
  runpalette run build --dry-run
  runpalette run test --json --timeout 2m
  runpalette mcp
`;

export function renderHelp(unicode: boolean): string {
  return unicode ? HELP : HELP.replaceAll("—", "-");
}
