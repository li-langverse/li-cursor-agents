import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { runCmd } from "../repo-workflow/git.js";

export interface LocalCiRunRow {
  repo?: string;
  number?: number;
  key?: string;
  ok?: boolean;
  exit_code?: number;
  profile?: string;
  finished_at?: string;
  log_tail?: string;
  message?: string;
  url?: string;
  gha_ci?: string;
}

export interface LocalCiResultsFile {
  runs?: LocalCiRunRow[];
  generated_at?: string;
  sweep_at?: string;
}

export function loadLocalCiResults(benchmarksRoot: string): LocalCiResultsFile | null {
  const path = join(benchmarksRoot, "data", "latest", "local-ci-results.json");
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as LocalCiResultsFile;
  } catch {
    return null;
  }
}

function classifyGha(rollup: unknown): string {
  if (!Array.isArray(rollup)) return "none";
  for (const item of rollup) {
    if (!item || typeof item !== "object") continue;
    const con = String((item as Record<string, unknown>).conclusion ?? "").toUpperCase();
    const st = String((item as Record<string, unknown>).status ?? "").toUpperCase();
    if (["FAILURE", "CANCELLED", "TIMED_OUT", "ACTION_REQUIRED"].includes(con)) return "fail";
    if (["QUEUED", "IN_PROGRESS", "PENDING", "WAITING"].includes(st)) return "pending";
  }
  return "pass";
}

export function fetchPrGhaCi(org: string, repo: string, number: number): string {
  const r = runCmd(
    "gh",
    [
      "pr",
      "view",
      String(number),
      "--repo",
      `${org}/${repo}`,
      "--json",
      "statusCheckRollup",
    ],
    process.cwd(),
    false,
  );
  if (!r.ok) return "none";
  try {
    const data = JSON.parse(r.stdout) as { statusCheckRollup?: unknown };
    return classifyGha(data.statusCheckRollup);
  } catch {
    return "none";
  }
}

export function formatLocalCiComment(row: LocalCiRunRow, ghaCi: string): string {
  const status = row.ok ? "passed" : "failed";
  const log = (row.log_tail || row.message || "").trim().slice(-3500);
  return [
    "<!-- li-agent local-ci -->",
    "## Local CI (li-local-ci)",
    "",
    `GitHub Actions rollup: \`${ghaCi}\` — this comment records **host** CI when GHA is missing or unreliable.`,
    "",
    `| Field | Value |`,
    `|-------|-------|`,
    `| Status | **${status}** |`,
    `| Profile | ${row.profile ?? "—"} |`,
    `| Exit code | ${row.exit_code ?? "—"} |`,
    `| Finished | ${row.finished_at ?? "—"} |`,
    "",
    "<details>",
    "<summary>Log excerpt</summary>",
    "",
    "```",
    log || "(no log captured)",
    "```",
    "",
    "</details>",
    "",
    "Re-run: `python3 benchmarks/scripts/local-ci-sweep.py --repo "
      + `${row.repo} --pr ${row.number}` + "`",
  ].join("\n");
}

export function shouldPostLocalCiComment(ghaCi: string, row: LocalCiRunRow | null): boolean {
  if (!row) return false;
  if (ghaCi === "pass") return false;
  return true;
}

export interface PostLocalCiCommentResult {
  posted: boolean;
  skipped?: string;
  url?: string;
  error?: string;
}

/** Post or update PR comment with local-ci output when GHA did not pass. */
export function postLocalCiComment(
  org: string,
  repo: string,
  number: number,
  row: LocalCiRunRow,
  options: { dryRun?: boolean } = {},
): PostLocalCiCommentResult {
  const dryRun = options.dryRun ?? false;
  const ghaCi = fetchPrGhaCi(org, repo, number);
  if (!shouldPostLocalCiComment(ghaCi, row)) {
    return { posted: false, skipped: `gha_ci=${ghaCi}, nothing to report` };
  }

  const body = formatLocalCiComment(row, ghaCi);
  const marker = "<!-- li-agent local-ci -->";

  const existing = runCmd(
    "gh",
    ["api", `repos/${org}/${repo}/issues/${number}/comments`, "--paginate", "--jq", ".[] | {id, body}"],
    process.cwd(),
    dryRun,
  );

  let commentId: string | undefined;
  if (existing.ok && existing.stdout && !dryRun) {
    try {
      const lines = existing.stdout.split("\n").filter(Boolean);
      for (const line of lines) {
        const c = JSON.parse(line) as { id: number; body: string };
        if (c.body?.includes(marker)) {
          commentId = String(c.id);
          break;
        }
      }
    } catch {
      /* ignore */
    }
  }

  if (commentId) {
    const edit = runCmd(
      "gh",
      ["api", "-X", "PATCH", `repos/${org}/${repo}/issues/comments/${commentId}`, "-f", `body=${body}`],
      process.cwd(),
      dryRun,
    );
    if (!edit.ok) return { posted: false, error: edit.stderr || "comment update failed" };
    return { posted: true, url: `https://github.com/${org}/${repo}/pull/${number}#issuecomment-${commentId}` };
  }

  const create = runCmd(
    "gh",
    ["pr", "comment", String(number), "--repo", `${org}/${repo}`, "--body", body],
    process.cwd(),
    dryRun,
  );
  if (!create.ok) return { posted: false, error: create.stderr || "pr comment failed" };
  return { posted: true, url: create.stdout };
}

export function postLocalCiCommentsForRecentRuns(
  benchmarksRoot: string,
  options: { dryRun?: boolean; limit?: number } = {},
): PostLocalCiCommentResult[] {
  const data = loadLocalCiResults(benchmarksRoot);
  if (!data?.runs?.length) return [];
  const org = process.env.GH_ORG ?? "li-langverse";
  const limit = options.limit ?? 5;
  const out: PostLocalCiCommentResult[] = [];

  for (const row of data.runs.slice(-limit)) {
    const repo = row.repo;
    const number = row.number;
    if (!repo || !number) continue;
    out.push(
      postLocalCiComment(org, repo, number, row, { dryRun: options.dryRun }),
    );
  }
  return out;
}
