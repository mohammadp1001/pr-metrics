---
name: issue-metrics
description: Report Claude Code token usage and elapsed time (first commit to PR merge, or first commit to now for a still-open PR) for a GitHub PR/issue. Use when the user wants to log/track/report how many tokens or how long an issue took, right after a PR is merged, mid-review on an open PR, or asks to see past issue metrics.
---

Reports token usage and time-to-merge for a PR, tied to the GitHub issue(s)
it closes, using the script at
`~/.claude/skills/issue-metrics/issue-metrics.mjs`. This script is
project-agnostic - it works from inside any git repo with a GitHub remote,
no per-repo setup needed.

## What it measures

- **Time**: first commit on the PR's branch → PR merge timestamp (via `gh`).
  For a PR that isn't merged yet, this becomes first commit → now (an
  in-progress elapsed time, not a final duration).
- **Tokens**: sums Claude Code transcript usage (`~/.claude/projects/**/*.jsonl`)
  for entries matching this repo's path and the PR's branch name. Only
  captures Claude-Code-assisted work done on this machine — a legitimate
  result can be all-zero if the work wasn't done through Claude Code here.
  For an open PR, this naturally includes any review-round work already
  done on the same branch.

## How to run it

```
node "$HOME/.claude/skills/issue-metrics/issue-metrics.mjs" [pr-number] [--dry-run] [--local]
```

Or, if the user's shell has the `issue-metrics` alias set up (PowerShell
profile function), just:

```
issue-metrics [pr-number] [--dry-run] [--local]
```

- `pr-number` — optional; defaults to the PR associated with the current
  branch. If that lookup fails ("no pull requests found for branch"), get
  the PR number explicitly, e.g. via `gh pr list` or by asking the user.
- `--dry-run` — prints the JSON summary only; does **not** write the CSV or
  post a PR comment. Always run this first to sanity-check the numbers.
  No-op on an open (unmerged) PR, since those never write/post anyway.
- `--local` — writes to `<repo>/metrics/issue-metrics.csv` inside the repo
  instead of the default central store at
  `~/.claude/metrics/<owner>-<repo>.csv`.

## Merged vs. open PRs

The JSON output has a `merged` boolean:

- `merged: true` — normal case. `mergedAt` is set, `durationHours` is
  first-commit-to-merge. Without `--dry-run`, this is the one that writes
  the CSV row and posts the PR comment.
- `merged: false` — the PR is still open (e.g. mid-review). `mergedAt` is
  `null` and `durationHours` is first-commit-to-*now* (elapsed so far, not
  final). This is **always read-only**: no CSV row, no PR comment, no
  matter what flags are passed. Useful for checking "how many tokens has
  this cost so far" while a review is still in progress.

## Workflow

1. Run first (with `--dry-run` if the PR might already be merged) and
   inspect the JSON output: `merged`, branch, issue numbers, duration,
   token totals, `assistantTurns`.
2. If `assistantTurns` is 0 or tokens are all zero, don't treat that as a
   bug — say so and explain why (see "What it measures" above) rather than
   re-running or tweaking flags to force a non-zero number.
3. If `merged: false`, just report the interim numbers - there's nothing
   else to confirm, since nothing gets written or posted.
4. If `merged: true`, posting the real result **writes a CSV row and posts
   a comment on the PR** — a shared, GitHub-visible action. Confirm with
   the user before running without `--dry-run`, unless they've already
   explicitly asked for the live run (e.g. "run it for real on PR #N").
5. Report the numbers back to the user in plain language (tokens total,
   duration), not just the raw JSON dump.

## Troubleshooting

- `Not inside a git repository` — run from within the target repo.
- `Could not resolve the GitHub repo` — repo has no GitHub remote, or `gh`
  isn't authenticated (`gh auth status`).
- `No PR found for the current branch` — pass the PR number explicitly.
