#!/usr/bin/env node
import { loadRuntimeEnv } from "../env.js";
loadRuntimeEnv();
import { installProcessStabilityHandlers } from "../swarm/process-stability.js";
installProcessStabilityHandlers("org-issue-implementer");
import https from "node:https";
import {
  appendImplementAudit,
  readActiveState,
  updateIssueStatus,
} from "../org-issues/org-issue-coordination.js";
import { parseIssueRef } from "../org-issues/org-issue-supervisor-config.js";
import { workerConsole } from "../worker/worker-console.js";

function parseArgs(argv: string[]) {
  let issue = "";
  let workerId = process.env.HOSTNAME ?? "local";
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--issue") issue = argv[++i] ?? "";
    else if (a === "--worker-id") workerId = argv[++i] ?? workerId;
  }
  return { issue, workerId };
}

function optionalGhComment(org: string, repo: string, number: number, body: string): void {
  const token = process.env.GH_TOKEN?.trim() || process.env.GITHUB_TOKEN?.trim();
  if (!token) return;
  const payload = JSON.stringify({ body });
  const req = https.request(
    {
      hostname: "api.github.com",
      path: `/repos/${org}/${repo}/issues/${number}/comments`,
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload),
      },
    },
    (res) => {
      res.resume();
      if ((res.statusCode ?? 0) >= 300) {
        workerConsole("org-issue-implementer", "warn", `gh comment HTTP ${res.statusCode}`);
      }
    },
  );
  req.on("error", (err) => {
    workerConsole("org-issue-implementer", "warn", `gh comment failed: ${err.message}`);
  });
  req.write(payload);
  req.end();
}

const { issue, workerId } = parseArgs(process.argv.slice(2));
const parsed = parseIssueRef(issue);
if (!parsed) {
  console.error("Usage: org-issue-implementer --issue li-langverse/<repo>#<num> [--worker-id ID]");
  process.exit(1);
}

const ref = issue;
const state = readActiveState();
const entry = state.issues[ref];
if (!entry || entry.workerId !== workerId) {
  workerConsole("org-issue-implementer", "ERROR", `not claimed by worker ${workerId}: ${ref}`);
  process.exit(1);
}

updateIssueStatus(ref, "running", `implementer ${workerId} started`);
workerConsole("org-issue-implementer", "info", `claimed issue ${ref} (stub implementer)`);

const summary = `[org-issue-supervisor stub] Worker \`${workerId}\` claimed \`${ref}\` for implementation. Full agent wiring pending.`;
optionalGhComment(parsed.org, parsed.repo, parsed.number, summary);

appendImplementAudit({
  issueRef: ref,
  workerId,
  status: "completed",
  stub: true,
});

updateIssueStatus(ref, "completed", "stub implementer finished");
workerConsole("org-issue-implementer", "info", `finished stub for ${ref}`);
console.log(JSON.stringify({ ok: true, issue: ref, workerId, stub: true }, null, 2));
