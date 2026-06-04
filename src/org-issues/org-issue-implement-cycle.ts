import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { resolveCursorApiKey, resolveCursorEnvFileHint } from "../env.js";
import { runAgent, agentsPackageRoot, shouldUseMock } from "../runner.js";
import { workerConsole } from "../worker/worker-console.js";
import type { AgentId } from "../types.js";
import type { QueuedOrgIssue } from "./org-issue-coordination.js";
import { removeClosedIssueFromQueue, sprintDataDir } from "./org-issue-coordination.js";
import { setPrBackoff } from "../org-prs/org-pr-coordination.js";
import { setPlannerBackoff } from "../org-planner/org-planner-coordination.js";
import { fetchGitHubIssue, postGitHubIssueComment } from "./org-issue-github.js";
import { orgName, parseIssueRef } from "./org-issue-supervisor-config.js";

export interface OrgIssueImplementOptions {
  issueRef: string;
  workerId: string;
  mock?: boolean;
  dryRun?: boolean;
}

export interface OrgIssueImplementResult {
  ok: boolean;
  status: "completed" | "failed";
  agentId: string;
  issueClosed: boolean;
  issueWasOpen: boolean;
  error?: string;
  agentStatus?: string;
  durationMs?: number;
  outputTail?: string;
}

export function orgIssueImplementerAgentId(): AgentId {
  const raw = process.env.LI_ORG_ISSUE_IMPLEMENTER_AGENT?.trim();
  if (raw === "org_issue_triage" || raw === "code_implementer") return raw;
  return "code_implementer";
}

function queueEntryForIssue(repo: string, number: number): QueuedOrgIssue | undefined {
  const path = join(sprintDataDir(), "org-issue-queue.json");
  if (!existsSync(path)) return undefined;
  const q = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  const rows = q.implement;
  if (!Array.isArray(rows)) return undefined;
  return rows.find(
    (r) =>
      r &&
      typeof r === "object" &&
      (r as QueuedOrgIssue).repo === repo &&
      Number((r as QueuedOrgIssue).number) === number,
  ) as QueuedOrgIssue | undefined;
}

export function buildIssueInstruction(
  issueRef: string,
  issue: {
    title: string;
    body: string | null;
    html_url: string;
    labels: string[];
  },
  workerId: string,
  queueEntry?: QueuedOrgIssue,
): string {
  const parsed = parseIssueRef(issueRef);
  const repo = parsed?.repo ?? "lic";
  const labels = issue.labels.length ? issue.labels.join(", ") : "(none)";
  const classification = queueEntry?.classification_note?.trim() || "implement bucket";
  const body = issue.body?.trim() || "(empty body)";

  return [
    "## Assigned GitHub issue (org-issue-zero implement bucket)",
    "",
    `- **Issue:** \`${issueRef}\``,
    `- **URL:** ${issue.html_url}`,
    `- **Title:** ${issue.title}`,
    `- **Labels:** ${labels}`,
    `- **Classification:** ${classification}`,
    `- **Worker:** \`${workerId}\``,
    "",
    "### Issue body",
    "",
    body,
    "",
    "---",
    "",
    "## Your task",
    "",
    "You are the org-issue-zero implementer for this **single** issue. Either:",
    "",
    "1. **Implement** a minimal fix matching repo conventions â†’ open PR â†’ when CI is green, close with:",
    "   `python3 scripts/org-close-issue.py --repo " +
      repo +
      " --number N --reason already_implemented --summary \"...\" --evidence \"PR #...\"`",
    "2. **Close without code** if duplicate / already on main / wontfix / not actionable â†’ always use `org-close-issue.py` with mandatory audit comment (never UI-only close).",
    "",
    "Read first:",
    "- `data/goal-directed-sprints/org-issue-zero.md`",
    "- `prompts/org-issue-triage-agent.md` (close/implement rules)",
    "",
    `workflow repo: ${repo}`,
    "",
    "Post a brief progress comment on the issue when you start substantive work.",
  ].join("\n");
}

function outputTail(text: string | undefined, max = 1500): string | undefined {
  if (!text?.trim()) return undefined;
  return text.trim().slice(-max);
}

/** Run Cursor SDK agent for one implement-bucket org issue. */
export async function runOrgIssueImplementCycle(
  options: OrgIssueImplementOptions,
): Promise<OrgIssueImplementResult> {
  const parsed = parseIssueRef(options.issueRef);
  if (!parsed) {
    return {
      ok: false,
      status: "failed",
      agentId: orgIssueImplementerAgentId(),
      issueClosed: false,
      issueWasOpen: false,
      error: `invalid issue ref: ${options.issueRef}`,
    };
  }

  const mock = shouldUseMock(options.mock ?? false);
  if (!mock && !options.dryRun && !resolveCursorApiKey()) {
    const hint = resolveCursorEnvFileHint();
    const msg =
      `CURSOR_API_KEY required for org-issue implementer (set in li-agents-secrets on K8s or ${hint} locally). ` +
      "Accepted env names: CURSOR_API_KEY, CURSOR_SDK_KEY, CURSOR_SDK, CURSOR_API_TOKEN.";
    workerConsole("org-issue-implementer", "ERROR", msg);
    return {
      ok: false,
      status: "failed",
      agentId: orgIssueImplementerAgentId(),
      issueClosed: false,
      issueWasOpen: false,
      error: msg,
    };
  }

  let issue;
  try {
    issue = await fetchGitHubIssue(parsed.org, parsed.repo, parsed.number);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/rate limit exceeded|secondary rate limit/i.test(msg)) {
      const until = new Date(Date.now() + 3_600_000).toISOString();
      setPrBackoff(until, "github_rate_limited");
      setPlannerBackoff(until, "github_rate_limited");
    }
    return {
      ok: false,
      status: "failed",
      agentId: orgIssueImplementerAgentId(),
      issueClosed: false,
      issueWasOpen: false,
      error: msg,
    };
  }

  if (issue.state === "closed") {
    workerConsole(
      "org-issue-implementer",
      "info",
      `${options.issueRef} already closed — marking completed`,
    );
    removeClosedIssueFromQueue(parsed.repo, parsed.number);
    return {
      ok: true,
      status: "completed",
      agentId: orgIssueImplementerAgentId(),
      issueClosed: true,
      issueWasOpen: false,
      outputTail: "issue already closed on GitHub",
    };
  }

  const agentId = orgIssueImplementerAgentId();
  const queueEntry = queueEntryForIssue(parsed.repo, parsed.number);
  const instruction = buildIssueInstruction(options.issueRef, issue, options.workerId, queueEntry);

  await postGitHubIssueComment(
    parsed.org,
    parsed.repo,
    parsed.number,
    [
      "**org-issue-zero implementer** claimed this issue.",
      "",
      `- Worker: \`${options.workerId}\``,
      `- Agent: \`${agentId}\``,
      `- Backend: ${mock ? "mock" : "cursor-sdk"}`,
    ].join("\n"),
  );

  workerConsole(
    "org-issue-implementer",
    "info",
    `running agent ${agentId} for ${options.issueRef} (repo=${parsed.repo})`,
  );

  const started = Date.now();
  let agentResult;
  try {
    agentResult = await runAgent({
      agentId,
      cwd: agentsPackageRoot(),
      mock,
      dryRun: options.dryRun ?? false,
      workflowRepo: parsed.repo,
      extraInstruction: instruction,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      status: "failed",
      agentId,
      issueClosed: false,
      issueWasOpen: true,
      error: msg,
      durationMs: Date.now() - started,
    };
  }

  let issueClosed = false;
  try {
    const after = await fetchGitHubIssue(parsed.org, parsed.repo, parsed.number);
    issueClosed = after.state === "closed";
  } catch {
    /* best-effort */
  }

  const output = agentResult.outputText ?? agentResult.error ?? "";
  const prMention =
    /github\.com\/[^\s/]+\/[^\s/]+\/pull\/\d+/i.test(output) ||
    /\bPR\s*#\s*\d+/i.test(output);
  const agentOk = agentResult.status === "finished";
  const partialSuccess = !agentOk && !issueClosed && prMention;
  const ok = agentOk || issueClosed || partialSuccess;

  if (partialSuccess) {
    workerConsole(
      "org-issue-implementer",
      "warn",
      `${options.issueRef} agent ${agentResult.status} but PR linked in output — partial success`,
    );
  }

  if (issueClosed) {
    workerConsole("org-issue-implementer", "info", `${options.issueRef} closed on GitHub`);
    removeClosedIssueFromQueue(parsed.repo, parsed.number);
  } else if (!agentOk && !partialSuccess) {
    workerConsole(
      "org-issue-implementer",
      "warn",
      `agent finished with status=${agentResult.status} issue still open`,
    );
  }

  return {
    ok,
    status: ok ? "completed" : "failed",
    agentId,
    issueClosed,
    issueWasOpen: true,
    agentStatus: agentResult.status,
    durationMs: Date.now() - started,
    outputTail: outputTail(output),
    error: ok
      ? undefined
      : agentResult.error ?? `agent status ${agentResult.status}${partialSuccess ? " (partial)" : ""}`,
  };
}
