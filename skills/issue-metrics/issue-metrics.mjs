#!/usr/bin/env node
// Reports Claude Code token usage and elapsed time for a merged PR, keyed to
// the GitHub issue(s) it closes. Works from inside any git repo with a
// GitHub remote - nothing here is specific to one project.
//
// Token source: local Claude Code transcript log
//   (~/.claude/projects/<repo-slug>/*.jsonl), filtered to entries whose
//   recorded cwd matches this repo and whose gitBranch matches the PR's
//   branch. Only captures Claude-Code-assisted work done on this machine.
//
// Time source: git (first commit on the PR's branch) + GitHub (PR merge
// timestamp, via `gh`).
//
// Usage:
//   node issue-metrics.mjs [pr-number] [--dry-run] [--local]
//
// With no PR number, uses the PR associated with the current branch.
// By default appends a row to ~/.claude/metrics/<owner>-<repo>.csv and
// posts a summary comment on the PR. --dry-run skips both the CSV write
// and the comment. --local writes metrics/issue-metrics.csv inside the
// repo instead of the central store.

import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, existsSync, mkdirSync, appendFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

function sh(cmd, args) {
  return execFileSync(cmd, args, { encoding: "utf8" }).trim();
}

function ghJson(args) {
  return JSON.parse(sh("gh", args));
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const useLocalCsv = args.includes("--local");
const prArg = args.find((a) => !a.startsWith("--"));

// --- resolve repo root and identity (works from any subdirectory) ---

let repoRootRaw;
try {
  repoRootRaw = sh("git", ["rev-parse", "--show-toplevel"]);
} catch {
  fail("Not inside a git repository (git rev-parse --show-toplevel failed).");
}
// Claude Code records `cwd` using the OS's native separator.
const repoRoot = process.platform === "win32" ? repoRootRaw.replace(/\//g, "\\") : repoRootRaw;

let nameWithOwner;
try {
  nameWithOwner = ghJson(["repo", "view", "--json", "nameWithOwner"]).nameWithOwner;
} catch (e) {
  fail(
    `Could not resolve the GitHub repo for ${repoRoot} (is 'gh' installed, authenticated, ` +
      `and does this repo have a GitHub remote?)\n${e.message}`
  );
}
const ghRepoArgs = ["--repo", nameWithOwner];

// --- resolve the PR ---

const prFields = "number,title,headRefName,mergedAt,closingIssuesReferences,commits,url";
let pr;
try {
  pr = prArg
    ? ghJson(["pr", "view", prArg, ...ghRepoArgs, "--json", prFields])
    : ghJson(["pr", "view", ...ghRepoArgs, "--json", prFields]);
} catch (e) {
  fail(
    prArg
      ? `Could not find PR #${prArg} in ${nameWithOwner}.\n${e.message}`
      : `No PR found for the current branch in ${nameWithOwner}. ` +
          `Pass a PR number explicitly: node issue-metrics.mjs <pr-number>\n${e.message}`
  );
}

if (!pr.mergedAt) {
  fail(`PR #${pr.number} (${nameWithOwner}) is not merged yet - nothing to report.`);
}
if (!pr.commits || pr.commits.length === 0) {
  fail(`PR #${pr.number} has no commits - cannot determine a start time.`);
}

const branch = pr.headRefName;
const mergedAt = new Date(pr.mergedAt);
const startedAt = pr.commits
  .map((c) => new Date(c.authoredDate ?? c.committedDate))
  .sort((a, b) => a - b)[0];
const issues = (pr.closingIssuesReferences ?? []).map((i) => i.number);

// --- token usage: scan Claude Code transcripts for this repo + branch ---

const projectsDir = path.join(homedir(), ".claude", "projects");
let transcriptFiles = [];
if (existsSync(projectsDir)) {
  for (const dir of readdirSync(projectsDir)) {
    const full = path.join(projectsDir, dir);
    for (const file of readdirSync(full).filter((f) => f.endsWith(".jsonl"))) {
      transcriptFiles.push(path.join(full, file));
    }
  }
}

const branchNeedle = `"gitBranch":"${branch}"`;
// JSON-escaped repo path, e.g. C:\Users\... -> C:\\Users\\...
const cwdNeedle = JSON.stringify(repoRoot).slice(1, -1);

const totals = { input: 0, cacheCreate: 0, cacheRead: 0, output: 0 };
let matchedLines = 0;

for (const file of transcriptFiles) {
  let content;
  try {
    content = readFileSync(file, "utf8");
  } catch {
    continue; // file may have been removed/rotated mid-scan
  }
  if (!content.includes(branchNeedle) || !content.includes(cwdNeedle)) continue;

  for (const line of content.split("\n")) {
    if (!line.includes(branchNeedle) || !line.includes(cwdNeedle)) continue;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    const usage = entry?.message?.usage;
    if (!usage) continue;
    totals.input += usage.input_tokens ?? 0;
    totals.cacheCreate += usage.cache_creation_input_tokens ?? 0;
    totals.cacheRead += usage.cache_read_input_tokens ?? 0;
    totals.output += usage.output_tokens ?? 0;
    matchedLines++;
  }
}

const totalTokens = totals.input + totals.cacheCreate + totals.cacheRead + totals.output;

// --- report ---

const durationMs = mergedAt - startedAt;
const durationHrs = durationMs / 3_600_000;

const summary = {
  repo: nameWithOwner,
  pr: pr.number,
  title: pr.title,
  branch,
  issues,
  startedAt: startedAt.toISOString(),
  mergedAt: mergedAt.toISOString(),
  durationHours: Math.round(durationHrs * 100) / 100,
  tokens: { ...totals, total: totalTokens },
  assistantTurns: matchedLines,
};

console.log(JSON.stringify(summary, null, 2));

if (matchedLines === 0) {
  console.warn(
    `Warning: no Claude Code transcript entries found for branch "${branch}" in ${nameWithOwner}. ` +
      `Token counts are zero - the work may not have used Claude Code, may have run on a different ` +
      `machine, or the branch name at commit time didn't match "${branch}" (e.g. it was renamed).`
  );
}

if (dryRun) {
  console.log("(--dry-run: skipping CSV write and PR comment)");
  process.exit(0);
}

// --- write CSV row ---

let csvPath;
if (useLocalCsv) {
  const metricsDir = path.join(repoRoot, "metrics");
  if (!existsSync(metricsDir)) mkdirSync(metricsDir, { recursive: true });
  csvPath = path.join(metricsDir, "issue-metrics.csv");
} else {
  const metricsDir = path.join(homedir(), ".claude", "metrics");
  if (!existsSync(metricsDir)) mkdirSync(metricsDir, { recursive: true });
  csvPath = path.join(metricsDir, `${nameWithOwner.replace("/", "-")}.csv`);
}

if (!existsSync(csvPath)) {
  appendFileSync(
    csvPath,
    "pr,issues,branch,started_at,merged_at,duration_hours,input_tokens,cache_creation_tokens,cache_read_tokens,output_tokens,total_tokens\n"
  );
}
appendFileSync(
  csvPath,
  [
    pr.number,
    `"${issues.join(";")}"`,
    branch,
    summary.startedAt,
    summary.mergedAt,
    summary.durationHours,
    totals.input,
    totals.cacheCreate,
    totals.cacheRead,
    totals.output,
    totalTokens,
  ].join(",") + "\n"
);
console.log(`Appended to ${csvPath}`);

// --- post PR comment ---

const commentBody = [
  `**Issue metrics** (via \`issue-metrics.mjs\`)`,
  ``,
  `- Issues closed: ${issues.length ? issues.map((n) => `#${n}`).join(", ") : "(none linked)"}`,
  `- Started: ${summary.startedAt}`,
  `- Merged: ${summary.mergedAt}`,
  `- Duration: ${summary.durationHours} h`,
  `- Tokens: ${totalTokens.toLocaleString()} total (input ${totals.input.toLocaleString()}, cache write ${totals.cacheCreate.toLocaleString()}, cache read ${totals.cacheRead.toLocaleString()}, output ${totals.output.toLocaleString()})`,
].join("\n");

sh("gh", ["pr", "comment", String(pr.number), ...ghRepoArgs, "--body", commentBody]);
console.log(`Posted comment on PR #${pr.number}`);
