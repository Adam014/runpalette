# Security Policy

## Supported versions

| Version | Supported |
| --- | --- |
| `0.1.x` | Yes |
| `< 0.1.0` | No |

Security fixes target the latest published release. Because Runpalette is
still below `1.0.0`, minor releases may include documented breaking changes.

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

Security-sensitive areas include project discovery, package-manager selection,
argument handling, process execution, terminal restoration, machine-readable
output, package contents, and release provenance. Vulnerabilities in a package
manager or runtime should also be reported to the relevant upstream project.

Runpalette delegates only to scripts already declared by the selected project.
Those scripts execute with the current user's normal permissions and should be
reviewed before they are run in an untrusted repository. `--dry-run --json`
can be used to inspect the exact executable, arguments, and working directory
without starting the task.
