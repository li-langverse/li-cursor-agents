import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { agentsPackageRoot } from "../runner.js";
import { removeClosedIssueFromQueue } from "./org-issue-coordination.js";

export const ORG_ISSUE_CLOSE_REASONS = [
  "already_implemented",
  "duplicate",
  "wontfix",
  "spam",
  "superseded",
  "not_actionable",
  "stale_no_response",
] as const;

export type OrgIssueCloseReason = (typeof ORG_ISSUE_CLOSE_REASONS)[number];

export interface CloseOrgIssueInput {
  repo: string;
  number: number;
  reason: OrgIssueCloseReason;
  summary: string;
  evidence: string;
  dryRun?: boolean;
}

export interface CloseOrgIssueResult {
  ok: boolean;
  closed: boolean;
  message: string;
  repo: string;
  number: number;
  reason: OrgIssueCloseReason;
}

export function isOrgIssueCloseReason(value: string): value is OrgIssueCloseReason {
  return (ORG_ISSUE_CLOSE_REASONS as readonly string[]).includes(value);
}

export function closeOrgIssue(input: CloseOrgIssueInput, root = agentsPackageRoot()): CloseOrgIssueResult {
  const { repo, number, reason, summary, evidence, dryRun } = input;
  const base = {
    repo,
    number,
    reason,
    closed: false as boolean,
    message: "",
  };

  if (!repo?.trim() || !Number.isFinite(number) || number < 1) {
    return { ...base, ok: false, message: "repo and positive number required" };
  }
  if (!isOrgIssueCloseReason(reason)) {
    return { ...base, ok: false, message: `invalid reason: ${reason}` };
  }
  if (!summary?.trim() || !evidence?.trim()) {
    return { ...base, ok: false, message: "summary and evidence are required" };
  }

  const script = join(root, "scripts", "org-close-issue.py");
  if (!existsSync(script)) {
    return { ...base, ok: false, message: `missing ${script}` };
  }

  const py = process.platform === "win32" ? "python" : "python3";
  const args = [
    script,
    "--repo",
    repo,
    "--number",
    String(number),
    "--reason",
    reason,
    "--summary",
    summary,
    "--evidence",
    evidence,
  ];
  if (dryRun) args.push("--dry-run");

  const proc = spawnSync(py, args, {
    cwd: root,
    env: process.env,
    encoding: "utf8",
    timeout: 120_000,
  });

  const tail = `${proc.stdout ?? ""}${proc.stderr ?? ""}`.trim();
  const ok = proc.status === 0 && !/failed|unknown reason/i.test(tail);
  const closed = ok && (/closed/i.test(tail) || dryRun === true);

  if (closed && !dryRun) {
    removeClosedIssueFromQueue(repo, number, root);
  }

  return {
    ok,
    closed,
    message: tail.slice(-500) || (ok ? "closed" : "close failed"),
    repo,
    number,
    reason,
  };
}
