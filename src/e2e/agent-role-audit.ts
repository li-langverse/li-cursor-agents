/**
 * Per-agent function audit — mock/CI checks that output matches the agent's role.
 * Used by agent-function-audit.e2e.ts (isolation + parallel).
 */
import { getAgent } from "../agents/registry.js";
import type { AgentDefinition, AgentId } from "../types.js";
import type { AgentRunResult } from "../types.js";

export interface AgentAuditResult {
  agentId: AgentId;
  ok: boolean;
  violations: string[];
}

/** Role-specific content expectations (mock deliverable sections / keywords). */
const ROLE_CONTENT: Partial<Record<AgentId, RegExp[]>> = {
  plan_verifier: [/Tracker review|plan_completion_audit|master-plan|PH/i],
  implementation_gaps: [/Plan vs code|plan debt|implementation evidence/i],
  gap_explorer: [/ecosystem gap|std module|explorer-finding/i],
  code_implementer: [/implement|gap|PH|issue/i],
  bug_fixer: [/CI|bug|fix/i],
  security_auditor: [/security|CVE|CWE|audit/i],
  issue_planner: [/implementation plan|Plans drafted|plan-needed/i],
  pr_branch_opener: [/PR|branch|pull request/i],
  pr_alignment: [/alignment|PR|vision|roadmap/i],
  pr_reviewer: [/review|standards|Proof|merge gate/i],
  pr_merger: [/merge queue|merge_plan|pr-auto-merge/i],
  numerics_researcher: [/numerics|bench|tier-1|ratio/i],
  autoresearch: [/numerics|bench|SOTA|novel/i],
  bench_improver: [/numerics|bench|harness|cpp/i],
  docs_maintainer: [/doc|handbook|live docs/i],
  ci_maintainer: [/CI|workflow|template/i],
  agent_kit_maintainer: [/Agent-kit rollout|agent-kit|agent kit|roadmap|org repo/i],
  org_repo_onboarder: [/new org repo|onboard|discovery|handoff/i],
  workspace_sweeper: [/workspace|sweep|uncommitted/i],
  package_architect: [/package|placement|monorepo/i],
  goal_researcher: [/research goal|Research goal|Goal researcher|SOTA/i],
  proof_gap_researcher: [/proof|provability|trusted|G-/i],
  stdlib_researcher: [/std|li-std|ecosystem/i],
  swarm_observer: [/swarm|handoff|self-healing|meta-agent/i],
  docs_ui_tester: [/ui-audit|remediation|contrast|baseline|axe/i],
  docs_ux_tester: [/ux-audit|SOTA|journey|friction|rubric/i],
  gui_ui_tester: [/ui-audit|remediation|pixel|dashboard/i],
  gui_ux_tester: [/ux-audit|SOTA|journey|empty.state/i],
  tui_ui_tester: [/ui-audit|remediation|terminal|TUI/i],
  tui_ux_tester: [/ux-audit|SOTA|journey|Textual/i],
  studio_ui_ux_builder: [/Studio UI\/UX|PH-UX|capture|bench|viewport|particle/i],
};

const CATEGORY_FALLBACK: Record<string, RegExp[]> = {
  pull_requests: [/PR|merge|review/i],
  numerics: [/numerics|bench/i],
  governance: [/plan|PH|implement|gap|audit/i],
  ecosystem: [/ecosystem|research|std|gap/i],
  security: [/security|audit/i],
  platform: [/Executive summary/i],
  orchestration: [/orchestrat|briefing|routes/i],
};

function rolePatterns(def: AgentDefinition): RegExp[] {
  const specific = ROLE_CONTENT[def.id];
  if (specific?.length) return specific;
  return CATEGORY_FALLBACK[def.category] ?? [/Executive summary/i];
}

function matchesAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((p) => p.test(text));
}

/** Audit a completed run against structural + role-specific expectations. */
export function auditAgentRun(
  agentId: AgentId,
  result: AgentRunResult,
  options?: {
    benchmarksRoot?: string;
    requireTrace?: boolean;
    allowIncomplete?: boolean;
  },
): AgentAuditResult {
  const violations: string[] = [];
  const def = getAgent(agentId);
  if (!def) {
    return { agentId, ok: false, violations: [`unknown agent: ${agentId}`] };
  }

  const dryRun = result.status === "dry-run";

  if (result.agentId !== agentId) {
    violations.push(`agentId mismatch: result=${result.agentId}`);
  }
  if (result.backend !== "mock") {
    violations.push(`expected mock backend, got ${result.backend}`);
  }
  if (result.status === "error") {
    violations.push(`status error: ${result.error ?? "unknown"}`);
  } else if (dryRun) {
    /* smoke only — skip deliverable sections */
  } else if (def.repoWorkflow || def.workspaceSweep) {
    if (result.status !== "finished" && result.status !== "incomplete") {
      violations.push(`repo/workflow agent expected finished|incomplete, got ${result.status}`);
    }
  } else if (!options?.allowIncomplete && result.status !== "finished") {
    violations.push(`expected status finished, got ${result.status}`);
  }

  if (String(result.error ?? "").includes("sdk-session.lock")) {
    violations.push("unexpected sdk-session.lock error under mock");
  }
  if (!result.outputPath?.endsWith(".md")) {
    violations.push("missing .md outputPath");
  }
  if (!result.runInput) {
    violations.push("missing runInput");
  } else if (result.runInput.agent_id !== agentId) {
    violations.push(`runInput.agent_id=${result.runInput.agent_id}`);
  }
  if (options?.benchmarksRoot && result.runInput?.cwd) {
    const cwd = result.runInput.cwd;
    const bench = options.benchmarksRoot;
    const onDemoBench = cwd === bench || cwd.startsWith(`${bench}/`);
    const onWorkflowClone =
      (def.repoWorkflow || def.guaranteedPush || def.workspaceSweep) &&
      /workspaces-test|li-demo|li-langverse/.test(cwd);
    if (!onDemoBench && !onWorkflowClone) {
      violations.push(
        `runInput.cwd should be demo benchmarks or workflow clone, got ${cwd}`,
      );
    }
  }
  if (!dryRun && options?.requireTrace !== false && !result.trace) {
    violations.push("missing run trace");
  }

  if (dryRun) {
    return { agentId, ok: violations.length === 0, violations };
  }

  const text = `${result.outputText ?? ""}\n${result.outputPath ?? ""}`;
  const agentKitRolloutDigest =
    agentId === "agent_kit_maintainer" && /# Agent-kit rollout/i.test(text);
  if (
    !/## Executive summary/i.test(text) &&
    result.status !== "incomplete" &&
    !agentKitRolloutDigest
  ) {
    violations.push("output missing ## Executive summary section");
  }
  if (!text.includes(agentId) && !text.includes(def.name)) {
    violations.push(`output should reference agent id or name (${agentId})`);
  }
  if (!matchesAny(text, rolePatterns(def))) {
    violations.push(
      `output missing role-specific content for ${agentId} (category ${def.category}); expected patterns: ${rolePatterns(def).map((r) => r.source).join(" | ")}`,
    );
  }
  if (!/li-agent-role:\s*[\w_]+/i.test(text)) {
    violations.push(`output missing <!-- li-agent-role: ${agentId} --> marker`);
  }

  return { agentId, ok: violations.length === 0, violations };
}

export function assertAgentAudit(
  audit: AgentAuditResult,
  context?: string,
): void {
  if (audit.ok) return;
  const prefix = context ? `${context}: ` : "";
  throw new Error(
    `${prefix}${audit.agentId} function audit failed:\n  - ${audit.violations.join("\n  - ")}`,
  );
}
