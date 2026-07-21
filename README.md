# pr-metrics

Reports Claude Code token usage and elapsed time (first commit to PR merge,
or first commit to now for a still-open PR) for a GitHub PR, tied to the
GitHub issue(s) it closes.

Zero npm dependencies - only needs `node`, `git`, and `gh` on `PATH`. Works
from inside any git repo with a GitHub remote; nothing is hardcoded to one
project.

## What it measures

- **Time**: first commit on the PR's branch -> PR merge timestamp (via `gh`).
  If the PR isn't merged yet, this is first commit -> now: an in-progress
  elapsed time, not a final duration.
- **Tokens**: sums Claude Code transcript usage
  (`~/.claude/projects/**/*.jsonl`) for entries matching this repo's path and
  the PR's branch name. Only captures Claude-Code-assisted work done on this
  machine - a legitimate result can be all-zero if the work wasn't done
  through Claude Code here. For an open PR, this naturally includes any
  review-round work already done on the same branch.

## Usage

```
node skills/pr-metrics/pr-metrics.mjs [pr-number] [--dry-run] [--local]
```

- No `pr-number` -> uses the PR associated with the current branch.
- `--dry-run` -> prints the JSON summary only; skips the CSV write and PR
  comment. Always run this first. No-op on an open PR (see below).
- `--local` -> writes `<repo>/metrics/pr-metrics.csv` inside the target
  repo instead of the default central store at
  `~/.claude/metrics/<owner>-<repo>.csv`.

The JSON output includes a `merged` boolean:

- `merged: true` -> a real (non-dry-run) invocation appends a CSV row **and
  posts a comment on the PR** - a shared, GitHub-visible action.
- `merged: false` -> always read-only. No CSV row, no PR comment, regardless
  of flags. Useful for checking token usage so far while a PR is still in
  review.

## Claude Code skill

`skills/pr-metrics/SKILL.md` is a Claude Code skill that tells an agent
how and when to invoke the script safely. To make it discoverable by Claude
Code, link (don't copy) it into place:

```powershell
New-Item -ItemType Junction -Path "$HOME\.claude\skills\pr-metrics" -Target "<path-to-this-repo>\skills\pr-metrics"
```

A convenience shell alias (PowerShell `$PROFILE`):

```powershell
function pr-metrics {
    node "$HOME\.claude\skills\pr-metrics\pr-metrics.mjs" @args
}
```
