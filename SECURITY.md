# Security Policy

## Supported versions

| Version | Supported |
| --- | --- |
| Latest npm release | Yes |
| Earlier releases | No |

Security fixes target the latest published release. Starting with 1.0.0, the
documented public surfaces follow the compatibility policy in
[Stability and versioning](./docs/stability.md).

## Report a vulnerability privately

Do not open a public issue for a suspected vulnerability or include secrets,
private repository data, or unpublished exploit details in a public
discussion.

Use [GitHub private vulnerability reporting](https://github.com/Adam014/runpalette/security/advisories/new)
to share:

- the affected Runpalette version and host environment;
- a minimal reproduction or proof of concept;
- the expected and observed behavior;
- the potential impact; and
- any known workaround.

Reports are handled privately until a fix and disclosure plan are ready.
Runpalette does not operate a bug-bounty program at this stage.

## Scope

Security-sensitive areas include project and command-source discovery,
package-manager selection, argument handling, process execution, MCP protocol
isolation, terminal restoration, machine-readable output, package contents,
and release provenance. Vulnerabilities in an owning task tool, package
manager, or runtime should also be reported to the relevant upstream project.

Runpalette delegates only to commands discovered from the selected project.
Those commands execute with the current user's normal permissions and should
be reviewed before they run. Native Just, Task, and Gradle metadata discovery
may evaluate trusted project configuration; it is bounded but not sandboxed.
Do not run Runpalette in an untrusted repository. `--dry-run --json` can inspect
the exact executable, arguments, source, and working directory without starting
the selected task.

The MCP server is read-only unless it is launched with `--allow-execution`.
That opt-in adds only catalog-owned execution, not arbitrary shell execution;
configured confirmations, time limits, and output limits remain enforced.
