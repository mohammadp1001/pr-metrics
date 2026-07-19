# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

`pr-metrics` is the standalone home for the `issue-metrics` tool: a script
plus a Claude Code skill that reports elapsed time (first commit -> PR
merge) and Claude Code token usage for a merged GitHub PR. It was moved here
from the personal `~/.claude/` dotfiles so it's version-controlled and
shareable independent of any one project.

- `skills/issue-metrics/issue-metrics.mjs` - the script (zero npm
  dependencies, only needs `node`, `git`, and `gh` on `PATH`).
- `skills/issue-metrics/SKILL.md` - the Claude Code skill that tells an
  agent how/when to invoke the script safely.

The folder is named `skills/issue-metrics/` (not, say, a top-level
`scripts/` + `skills/` split) specifically so it can be discovered by Claude
Code, which finds skills at `<skills-dir>/<skill-name>/SKILL.md`.

## Discovery mechanism

Claude Code only discovers skills under `~/.claude/skills/` (or a project's
own `.claude/skills/`). This repo is expected to be cloned to a normal
location (e.g. `~/projects/pr-metrics/`), then linked into place with a
Windows junction (not a symlink - junctions don't need admin/Developer
Mode):

```powershell
New-Item -ItemType Junction -Path "$HOME\.claude\skills\issue-metrics" -Target "<path-to-this-repo>\skills\issue-metrics"
```

A PowerShell `$PROFILE` alias points at the junctioned path so the script
also runs as a bare command:

```powershell
function issue-metrics {
    node "$HOME\.claude\skills\issue-metrics\issue-metrics.mjs" @args
}
```

Because the alias and `SKILL.md` both reference the junctioned path (not
this repo's real on-disk location), the repo can be re-cloned or relocated
without updating either of them - only the junction target needs to change.

## What the tool does

```
node skills/issue-metrics/issue-metrics.mjs [pr-number] [--dry-run] [--local]
```

- **Time**: first commit on the PR's branch -> PR merge timestamp (via `gh`).
- **Tokens**: Claude Code usage summed from local transcript logs
  (`~/.claude/projects/**/*.jsonl`), filtered to entries whose recorded
  `cwd` matches the current repo and whose `gitBranch` matches the PR's
  branch. This only captures Claude-Code-assisted work done on *this*
  machine - an all-zero result can be legitimate.

It is repo-agnostic: everything (owner/repo, branch, PR) is resolved from
`git`/`gh` at runtime when the script is invoked from inside a *target*
repo (i.e. run this script from within `fit_me` or whatever project you're
reporting on, not from within `pr-metrics` itself).

- No `pr-number` -> uses the PR associated with the current branch.
- `--dry-run` -> prints the JSON summary only; skips the CSV write and PR
  comment. Always run this first.
- `--local` -> writes `<target-repo>/metrics/issue-metrics.csv` instead of
  the default central store at `~/.claude/metrics/<owner>-<repo>.csv`.

A real (non-dry-run) invocation appends a CSV row **and posts a comment on
the PR** - a shared, GitHub-visible action. Always dry-run first; only run
for real when the user has explicitly asked for it.

Collected metrics data (e.g. `~/.claude/metrics/<owner>-<repo>.csv`) is
local-machine data, not part of this repo, and isn't meant to be committed.

## Design notes worth preserving

These came out of hard-won debugging during the original build and should
not be casually "simplified" away:

- **Transcript filtering is a two-stage match**: a plain substring check for
  `"gitBranch":"<branch>"` and the JSON-escaped repo path on each line
  *before* `JSON.parse`-ing it. Parsing every line of every transcript is
  too slow across thousands of lines.
- **Windows path normalization**: `git rev-parse --show-toplevel` always
  returns forward slashes, but Claude Code records `cwd` in transcripts
  using the OS-native separator. On `win32` the repo root must be converted
  to backslashes before matching, or the filter silently matches nothing.
- **Every `gh` call passes `--repo owner/name` explicitly**, resolved once
  via `gh repo view --json nameWithOwner`, rather than relying on `gh`'s
  cwd-based repo inference (fragile depending on how/where the script is
  invoked).
- **Central CSV store over per-repo CSVs**: metrics live at
  `~/.claude/metrics/<owner>-<repo>.csv` by default, not inside each
  project, because collected metrics are local-machine data, not
  meaningful project history. `--local` exists only as an opt-in escape
  hatch.
