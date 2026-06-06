#!/usr/bin/env node
/**
 * Org swarm stability gate — run on PVC data (local or K8s mount).
 * Exits non-zero when recent triage/merge health regresses.
 *
 * Usage: node scripts/test-org-swarm-stability.mjs [sprint-data-dir]
 */
import { readFileSync, existsSync, appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const root = process.argv[2] ?? join(process.cwd(), "data", "goal-directed-sprints");
const WINDOW_MS = Number(process.env.LI_SWARM_STABILITY_WINDOW_MS ?? 2 * 60 * 60 * 1000);
const MIN_TRIAGE_SAMPLES = Number(process.env.LI_SWARM_STABILITY_MIN_SAMPLES ?? 3);
const MAX_FAIL_RATE = Number(process.env.LI_SWARM_STABILITY_MAX_FAIL_RATE ?? 0.6);
const now = Date.now();

function readJsonl(name) {
  const path = join(root, name);
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function recent(rows) {
  return rows.filter((r) => {
    const ts = Date.parse(String(r.ts ?? ""));
    return Number.isFinite(ts) && now - ts <= WINDOW_MS;
  });
}

function readJson(name) {
  const path = join(root, name);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

const triage = recent(readJsonl("org-issue-triage-audit.jsonl"));
const closes = readJsonl("org-issue-close-audit.jsonl");
const backoff = readJson("org-pr-gh-backoff.json");
const queue = readJson("org-issue-queue.json");

const completed = triage.filter((r) => r.status === "completed");
const failed = triage.filter((r) => r.status === "failed");
const closed = triage.filter((r) => r.issueClosed === true);
const rateLimitFails = failed.filter((r) =>
  /rate limit exceeded|secondary rate limit/i.test(String(r.error ?? "")),
);
const bashCrash = failed.filter((r) => /bash\\r|'bash\\r'/i.test(String(r.error ?? "")));

const failRate = triage.length ? failed.length / triage.length : 0;
const open = queue?.report?.total_open ?? null;
const needsTriage = Array.isArray(queue?.needs_triage) ? queue.needs_triage.length : null;

const report = {
  ts: new Date().toISOString(),
  window_ms: WINDOW_MS,
  triage_samples: triage.length,
  triage_completed: completed.length,
  triage_failed: failed.length,
  triage_closed: closed.length,
  triage_fail_rate: failRate,
  rate_limit_fails: rateLimitFails.length,
  bash_crlf_crashes: bashCrash.length,
  backoff_until: backoff?.until ?? null,
  open_issues: open,
  needs_triage: needsTriage,
  close_audit_total: closes.length,
};

console.log("org-swarm-stability:", JSON.stringify(report, null, 2));

mkdirSync(root, { recursive: true });
appendFileSync(join(root, "org-swarm-stability-audit.jsonl"), `${JSON.stringify(report)}\n`);

const errors = [];

if (bashCrash.length > 0) {
  errors.push(`CRLF entrypoint crash detected (${bashCrash.length} triage failures)`);
}

if (triage.length >= MIN_TRIAGE_SAMPLES && failRate > MAX_FAIL_RATE && completed.length === 0) {
  errors.push(`triage fail rate ${(failRate * 100).toFixed(0)}% with zero completions`);
}

if (
  triage.length >= MIN_TRIAGE_SAMPLES &&
  rateLimitFails.length === triage.length &&
  triage.length >= 5
) {
  errors.push("all recent triage failures are GitHub rate limits — check token quota");
}

if (errors.length) {
  console.error("FAIL:", errors.join("; "));
  process.exit(1);
}

console.log("PASS: org swarm stability OK");
process.exit(0);
