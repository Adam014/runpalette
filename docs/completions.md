# Shell completion

Runpalette generates completion scripts for Bash, Zsh, Fish, and PowerShell.
The scripts complete Runpalette commands and options, then read project command
names and aliases from the current repository when completing `runpalette run`.

Runpalette prints the script to stdout. It never edits a shell profile or
writes outside the project.

## Try it in the current shell

### Bash

```bash
source <(runpalette completion bash)
```

### Zsh

Initialize Zsh completion once, then source the generated script:

```zsh
autoload -Uz compinit && compinit
source <(runpalette completion zsh)
```

### Fish

```fish
runpalette completion fish | source
```

### PowerShell

```powershell
runpalette completion powershell | Out-String | Invoke-Expression
```

## Install it persistently

Write the generated output to a completion location managed by your shell.
Common user-level locations are:

```bash
# Bash
mkdir -p ~/.local/share/bash-completion/completions
runpalette completion bash > ~/.local/share/bash-completion/completions/runpalette

# Zsh — ensure this directory is present in FPATH before compinit runs
mkdir -p ~/.zfunc
runpalette completion zsh > ~/.zfunc/_runpalette

# Fish
mkdir -p ~/.config/fish/completions
runpalette completion fish > ~/.config/fish/completions/runpalette.fish
```

For PowerShell, save the generated script and source it from `$PROFILE`.
Restart the shell after changing persistent completion configuration.

## Behavior and safety

- Completion discovery reads the same project catalog as `runpalette list`.
- It does not execute a selected project command.
- Errors are suppressed by the generated script so a broken or unsupported
  directory does not interrupt normal shell completion.
- Command names containing line-breaking control characters are intentionally
  excluded from candidates. Spaces and ordinary punctuation are preserved.
- Regenerate the script after upgrading Runpalette so new CLI commands and
  options become available. Project command candidates remain dynamic.
