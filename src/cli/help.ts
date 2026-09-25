export const HELP = `Runpalette — project commands, made visible

Usage:
  runpalette                     Open the interactive command palette
  runpalette list                List discovered commands
  runpalette run NAME [-- ARGS]  Run one package script

Options:
  --cwd PATH                     Start project discovery from PATH
  --workspace NAME              Limit listing or execution to one workspace
  --group ID                    Limit listing or the palette to one group
  --config PATH                 Use an explicit runpalette.json file
  --package-manager NAME         Use npm, pnpm, yarn, or bun
  --json                         Emit one machine-readable JSON result
  --non-interactive              Never open a prompt
  --dry-run                      Show the exact execution plan
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
  runpalette run test -- --watch
  runpalette run test --workspace @acme/api
  runpalette run build --dry-run
`;
