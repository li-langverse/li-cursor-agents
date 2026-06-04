import { setPlannerBackoff } from "../org-planner/org-planner-coordination.js";
import { setPrBackoff } from "../org-prs/org-pr-coordination.js";
import { resolveCursorApiKey, resolveCursorEnvFileHint } from "../env.js";
import { runAgent, agentsPackageRoot, shouldUseMock } from "../runner.js";
import { workerConsole } from "../worker/worker-console.js";
import type { AgentId } from "../types.js";
import type { QueuedOrgIssue } from "./org-issue-coordination.js";
import { removeClosedIssueFromQueue } from "./org-issue-coordination.js";
import { fetchGitHubIssue, postGitHubIssueComment } from "./org-issue-github.js";
import { issueRef, parseIssueRef } from "./org-issue-supervisor-config.js";

export interface OrgIssueTriageOptions {
  issueRef: string;
  workerId: string;
  mock?: boolean;
  dryRun?: boolean;
}

export interface OrgIssueTriageResult {
  ok: boolean;
  status: "completed" | "failed";
  agentId: string;
  issueClosed: boolean;
  issueWasOpen: boolean;
  routed?: "close" | "implement" | "planner" | "none";
  error?: string;
  agentStatus?: string;
  durationMs?: number;
  outputTail?: string;
}

export function orgIssueTriageAgentId(): AgentId {
  const raw = process.env.LI_ORG_ISSUE_TRIAGE_AGENT?.trim();
  if (raw === "org_issue_triage" || raw === "code_implementer") return raw;
  return "org_issue_triage";
}

function buildTriageInstruction(
  issueRef: string,
  issue: { title: string; body: string | null; labels: string[]; html_url: string },
  workerId: string,
  queueEntry?: QueuedOrgIssue,
): string {
  const parsed = parseIssueRef(issueRef);
  const repo = parsed?.repo ?? "lic";
  const labels = issue.labels.length ? issue.labels.join(", ") : "(none)";
  const classification = queueEntry?.classification_note?.trim() || "needs_triage";
  const body = issue.body?.trim() || "(empty body)";

  return [
    "## Assigned GitHub issue (org-issue-zero **triage** bucket)",
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
    "You are the **triage** agent for this single open issue. Decide and **execute** one outcome:",
    "",
    "1. **Close with evidence** (duplicate, spam, already on main, wontfix, superseded):",
    "   Run `python3 scripts/org-close-issue.py --repo " +
      repo +
      " --number N --reason <reason> --summary \"...\" --evidence \"...\"`",
    "   Do not close via GitHub UI only.",
    "",
    "2. **Route to implementation** (actionable bug/feature with clear AC): add label `plan-approved` or `bug`/`enhancement`, comment, stop.",
    "",
    "3. **Route to planner** (needs design/plan): ensure `plan-needed` (or comment), stop — do not close.",
    "",
    "4. **Stale / needs human**: comment with concrete ask; only close if author unresponsive and policy allows `stale_no_response`.",
    "",
    "Read first: `prompts/org-issue-triage-agent.md`, `data/goal-directed-sprints/org-issue-zero.md`.",
    "",
    "After any `org-close-issue.py` success, the issue must show **closed** on GitHub.",
    "",
    `workflow repo: ${repo}`,
  ].join("\n");
}

function outputTail(text: string | undefined, max = 1500): string | undefined {
  if (!text?.trim()) return undefined;
  return text.trim().slice(-max);
}

function detectRouted(output: string): OrgIssueTriageResult["routed"] {
  if (/org-close-issue\.py/i.test(output) && /closed|close/i.test(output)) return "close";
  if (/plan-approved|route.*implement|implement bucket/i.test(output)) return "implement";
  if (/plan-needed|route_planner|issue-feature-planner/i.test(output)) return "planner";
  return "none";
}

export async function runOrgIssueTriageCycle(
  options: OrgIssueTriageOptions,
): Promise<OrgIssueTriageResult> {
  const parsed = parseIssueRef(options.issueRef);
  if (!parsed) {
    return {
      ok: false,
      status: "failed",
      agentId: orgIssueTriageAgentId(),
      issueClosed: false,
      issueWasOpen: false,
      error: `invalid issue ref: ${options.issueRef}`,
    };
  }

  const mock = shouldUseMock(options.mock ?? false);
  if (!mock && !options.dryRun && !resolveCursorApiKey()) {
    const hint = resolveCursorEnvFileHint();
    const msg =
      `CURSOR_API_KEY required for org-issue triage (set in li-agents-secrets on K8s or ${hint} locally).`;
    workerConsole("org-issue-triage", "ERROR", msg);
    return {
      ok: false,
      status: "failed",
      agentId: orgIssueTriageAgentId(),
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
      agentId: orgIssueTriageAgentId(),
      issueClosed: false,
      issueWasOpen: false,
      error: msg,
    };
  }

  if (issue.state === "closed") {
    removeClosedIssueFromQueue(parsed.repo, parsed.number);
    return {
      ok: true,
      status: "completed",
      agentId: orgIssueTriageAgentId(),
      issueClosed: true,
      issueWasOpen: false,
      routed: "close",
      outputTail: "issue already closed on GitHub",
    };
  }

  const agentId = orgIssueTriageAgentId();
  const instruction = buildTriageInstruction(options.issueRef, issue, options.workerId);

  await postGitHubIssueComment(
    parsed.org,
    parsed.repo,
    parsed.number,
    [
      "**org-issue-zero triage** claimed this issue.",
      "",
      `- Worker: \`${options.workerId}\``,
      `- Agent: \`${agentId}\``,
    ].join("\n"),
  );

  workerConsole("org-issue-triage", "info", `running agent ${agentId} for ${options.issueRef}`);

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
  const routed = detectRouted(output);
  const agentOk = agentResult.status === "finished";
  const ok = agentOk || issueClosed;

  if (issueClosed) {
    removeClosedIssueFromQueue(parsed.repo, parsed.number);
    workerConsole("org-issue-triage", "info", `${options.issueRef} closed on GitHub`);
  }

  return {
    ok,
    status: ok ? "completed" : "failed",
    agentId,
    issueClosed,
    issueWasOpen: true,
    routed: issueClosed ? "close" : routed,
    agentStatus: agentResult.status,
    durationMs: Date.now() - started,
    outputTail: outputTail(output),
    error: ok ? undefined : agentResult.error ?? `agent status ${agentResult.status}`,
  };
}
