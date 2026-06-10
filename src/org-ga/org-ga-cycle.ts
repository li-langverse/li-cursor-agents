import { resolveCursorApiKey, resolveCursorEnvFileHint } from "../env.js";
import { getAgent } from "../agents/registry.js";
import { runAgent, agentsPackageRoot, shouldUseMock } from "../runner.js";
import { workerConsole } from "../worker/worker-console.js";
import type { AgentId } from "../types.js";
import {
  gaLaneAgentId,
  GA_LANE_DEFS,
  parseGaRef,
  type GaLaneId,
} from "./org-ga-supervisor-config.js";

export interface OrgGaCycleOptions {
  gaRef: string;
  workerId: string;
  mock?: boolean;
  dryRun?: boolean;
}

export interface OrgGaCycleResult {
  ok: boolean;
  status: "completed" | "failed";
  agentId: string;
  repo: string;
  lane: GaLaneId;
  stub: boolean;
  error?: string;
  agentStatus?: string;
  durationMs?: number;
  outputTail?: string;
}

function outputTail(text: string | undefined, max = 2000): string | undefined {
  if (!text?.trim()) return undefined;
  return text.trim().slice(-max);
}

export function buildGaAuditInstruction(repo: string, lane: GaLaneId, workerId: string): string {
  const laneMeta = GA_LANE_DEFS.find((l) => l.id === lane);
  const label = laneMeta?.label ?? lane;
  return [
    "# G&A swarm audit",
    "",
    `You are the **${label}** lane auditor for repo \`${repo}\` in li-langverse.`,
    "",
    "## Mandatory reads (org rules)",
    "",
    "1. `.cursor/rules/li-ecosystem-gates.mdc` and `org-ga-enforcement.mdc`",
    "2. `../roadmap/docs/ecosystem/engineering-standards.md`",
    "3. Repo README + CHANGELOG + existing test dirs",
    "",
    "## Coverage contract (enforce)",
    "",
    "- **Use cases:** every documented user-facing flow has a test or filed GitLab issue with `ga-gap` label",
    "- **Functions / types:** every exported public symbol has unit or integration coverage OR `ga-waiver` issue",
    "- **UI (if applicable):** every interactive element has E2E or visual test; use `data-testid` where missing",
    "- **SOC lane:** map controls to lic CVE/CWE catalog; no silent security regressions",
    "- **Docs lane:** README, API docs, runbooks match code; Magic Patterns / Li brand tokens consistent",
    "",
    `## Lane focus: \`${lane}\``,
    "",
    getLaneChecklist(lane),
    "",
    "## Deliverables",
    "",
    "1. Run applicable test commands (`npm test`, `lit test`, `li-tests`, Playwright, etc.)",
    `2. Write audit to \`data/ga-audits/${repo}-${lane}.md\``,
    "3. File GitLab issues for gaps (`ga-gap`, `plan-needed`) — do not leave silent failures",
    "4. Open MR only when fixes are in-scope for this lane and tests are green",
    "",
    `- **Worker:** \`${workerId}\``,
    `- **GitLab primary:** clone \`gitlab.lilangverse.xyz/li-langverse/${repo}\``,
  ].join("\n");
}

function getLaneChecklist(lane: GaLaneId): string {
  switch (lane) {
    case "unit":
      return [
        "- Co-located `*.test.*` or `lit` unit suites",
        "- Edge cases: null, empty, boundary, error paths",
        "- std/** in lic: 100% line coverage per org gate",
      ].join("\n");
    case "integration":
      return [
        "- Cross-module / API integration tests",
        "- Fixtures match production contracts",
        "- No network in unit lane — integration owns I/O boundaries",
      ].join("\n");
    case "e2e":
      return [
        "- Playwright/Cypress or `li-tests` e2e where applicable",
        "- Happy path + primary error flows per README use case",
        "- CI job exists on GitLab `.gitlab-ci.yml`",
      ].join("\n");
    case "gui-visual":
      return [
        "- Visual regression or Figma parity (Magic Patterns MCP if configured)",
        "- Responsive breakpoints; accessibility roles/labels",
        "- Screenshot diff or checklist in audit file",
      ].join("\n");
    case "soc":
      return [
        "- `run_security.sh` / tier5 exploits where applicable",
        "- Secrets scan; dependency CVEs; SOC2-relevant logging",
        "- Align with `security_auditor` agent findings",
      ].join("\n");
    case "documentation":
      return [
        "- README quickstart works from clean clone",
        "- Public API surfaces documented",
        "- Li / Magic Patterns brand: typography, colors, voice per design system",
      ].join("\n");
    default:
      return "- Full org gate checklist";
  }
}

export async function runOrgGaCycle(options: OrgGaCycleOptions): Promise<OrgGaCycleResult> {
  const parsed = parseGaRef(options.gaRef);
  if (!parsed) {
    return {
      ok: false,
      status: "failed",
      agentId: "ga_unit_auditor",
      repo: "",
      lane: "unit",
      stub: false,
      error: `invalid ga ref: ${options.gaRef}`,
    };
  }

  const { repo, lane } = parsed;
  const agentId = gaLaneAgentId(lane) as AgentId;
  const agent = getAgent(agentId);
  if (!agent) {
    return {
      ok: false,
      status: "failed",
      agentId,
      repo,
      lane,
      stub: false,
      error: `unknown agent ${agentId}`,
    };
  }

  const mock = shouldUseMock(options.mock ?? false);

  if (!mock && !options.dryRun && !resolveCursorApiKey()) {
    const hint = resolveCursorEnvFileHint();
    return {
      ok: false,
      status: "failed",
      agentId,
      repo,
      lane,
      stub: false,
      error: `CURSOR_API_KEY required (${hint})`,
    };
  }

  if (options.dryRun) {
    workerConsole("org-ga-worker", "info", `dry-run ${options.gaRef}`);
    return { ok: true, status: "completed", agentId, repo, lane, stub: true };
  }

  const instruction = buildGaAuditInstruction(repo, lane, options.workerId);
  workerConsole("org-ga-worker", "info", `running agent ${agentId} for ${options.gaRef}`);

  const started = Date.now();
  let agentResult;
  try {
    agentResult = await runAgent({
      agentId,
      cwd: agentsPackageRoot(),
      mock,
      dryRun: false,
      extraInstruction: instruction,
      workflowRepo: repo,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      status: "failed",
      agentId,
      repo,
      lane,
      stub: false,
      error: msg,
      durationMs: Date.now() - started,
    };
  }

  const agentOk = agentResult.status === "finished";
  return {
    ok: agentOk,
    status: agentOk ? "completed" : "failed",
    agentId,
    repo,
    lane,
    stub: mock,
    agentStatus: agentResult.status,
    durationMs: Date.now() - started,
    outputTail: outputTail(agentResult.outputText ?? agentResult.error),
    error: agentOk ? undefined : agentResult.error ?? `agent status ${agentResult.status}`,
  };
}
