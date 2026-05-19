/** Map ui-audit / ux-audit preflight into briefing.recommended_agents. */

import type { BriefingRecommendation } from "./swarm-recommendations.js";

const UX_AGENTS = ["docs_ux_tester", "gui_ux_tester", "tui_ux_tester"] as const;

function auditFailing(audit: unknown): number {
  if (!audit || typeof audit !== "object") return 0;
  const summary = (audit as Record<string, unknown>).summary as Record<string, number> | undefined;
  return Number(summary?.failing ?? 0);
}

function uxRubricFailing(audit: unknown): boolean {
  if (!audit || typeof audit !== "object") return false;
  const targets = (audit as Record<string, unknown>).targets;
  if (!Array.isArray(targets)) return false;
  return targets.some((t) => t && typeof t === "object" && (t as Record<string, unknown>).status === "fail");
}

export function uxAuditRecommendations(briefing: Record<string, unknown>): BriefingRecommendation[] {
  const out: BriefingRecommendation[] = [];
  const uiFail = auditFailing(briefing.ui_audit);
  const uxFail = uxRubricFailing(briefing.ux_audit);

  if (uiFail > 0) {
    out.push({
      agent: "docs_ui_tester",
      reason: `ui-audit: ${uiFail} failing target(s) — docs UI pass first`,
      source: "ui_audit",
    });
    out.push({
      agent: "gui_ui_tester",
      reason: `ui-audit: ${uiFail} failing target(s) — GUI surfaces`,
      source: "ui_audit",
    });
    out.push({
      agent: "tui_ui_tester",
      reason: `ui-audit: ${uiFail} failing target(s) — TUI surfaces`,
      source: "ui_audit",
    });
  }

  if (uxFail) {
    for (const agent of UX_AGENTS) {
      out.push({
        agent,
        reason: "ux-audit: rubric or journey below threshold",
        source: "ux_audit",
      });
    }
  }

  return out;
}

export function mergeUxAuditRecommendations(
  briefing: Record<string, unknown>,
): Record<string, unknown> {
  const merged = { ...briefing };
  const have = new Set<string>();
  if (Array.isArray(merged.recommended_agents)) {
    for (const row of merged.recommended_agents) {
      if (row && typeof row === "object" && typeof (row as Record<string, unknown>).agent === "string") {
        have.add(String((row as Record<string, unknown>).agent));
      }
    }
  }
  const extra = uxAuditRecommendations(merged).filter((r) => !have.has(r.agent));
  const prior = Array.isArray(merged.recommended_agents) ? [...merged.recommended_agents] : [];
  merged.recommended_agents = [...extra, ...prior];
  return merged;
}

export function mergeRemediationQueueFromManifest(
  briefing: Record<string, unknown>,
): Record<string, unknown> {
  const merged = { ...briefing };
  const manifest = merged.remediation_manifest as Record<string, unknown> | undefined;
  const queueFromManifest = manifest?.implementation_queue;
  if (!Array.isArray(queueFromManifest) || !queueFromManifest.length) {
    return merged;
  }
  const prior = Array.isArray(merged.implementation_queue) ? [...merged.implementation_queue] : [];
  merged.implementation_queue = [...queueFromManifest, ...prior];
  return merged;
}
