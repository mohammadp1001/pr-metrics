---
name: issue-metrics
description: Report Claude Code token usage and elapsed time (first commit to PR merge) for a merged GitHub PR/issue. Use when the user wants to log/track/report how many tokens or how long an issue took, right after a PR is merged, or asks to see past issue metrics.
---

Reports token usage and time-to-merge for a merged PR, tied to the GitHub
issue(s) it closes, using the script at
`~/.claude/skills/issue-metrics/issue-metrics.mjs`. This script is
project-agnostic - it works from inside any git repo with a GitHub remote,
no per-repo setup needed.

## What it measures

- **Time**: first commit on the PR's branch → PR merge timestamp (via `gh`).
- **Tokens**: sums Claude Code transcript usage (`~/.claude/projects/**/*.jsonl`)
  for entries matching this repo's path and the PR's branch name. Only
  captures Claude-Code-assisted work done on this machine — a legitimate
  result can be all-zero if the work wasn't done through Claude Code here.

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
- `--local` — writes to `<repo>/metrics/issue-metrics.csv` inside the repo
  instead of the default central store at
  `~/.claude/metrics/<owner>-<repo>.csv`.

## Workflow

1. Run with `--dry-run` first and inspect the JSON output: branch, issue
   numbers, duration, token totals, `assistantTurns`.
2. If `assistantTurns` is 0 or tokens are all zero, don't treat that as a
   bug — say so and explain why (see "What it measures" above) rather than
   re-running or tweaking flags to force a non-zero number.
3. Posting the real result **writes a CSV row and posts a comment on the
   PR** — a shared, GitHub-visible action. Confirm with the user before
   running without `--dry-run`, unless they've already explicitly asked for
   the live run (e.g. "run it for real on PR #N").
4. Report the numbers back to the user in plain language (tokens total,
   duration), not just the raw JSON dump.

## Troubleshooting

- `Not inside a git repository` — run from within the target repo.
- `Could not resolve the GitHub repo` — repo has no GitHub remote, or `gh`
  isn't authenticated (`gh auth status`).
- `No PR found for the current branch` — pass the PR number explicitly.
- `PR #N is not merged yet` — the script only reports on merged PRs by
  design (time-to-merge is undefined otherwise).
