/** Enqueue code_implementer handoffs for P0 UI/UX remediation queue items. */

import { listHandoffs, createHandoff } from "./handoff-store.js";
import type { RemediationQueueItem } from "../ux-audit/remediation-manifest.js";

export async function enqueueUxRemediationHandoff(options: {
  item: RemediationQueueItem;
  fromAgent: string;
  briefingHash?: string;
  sourceRunId?: string;
}): Promise<ReturnType<typeof createHandoff> | null> {
  if (options.item.kind !== "ui_remediation" && options.item.kind !== "ux_remediation") {
    return null;
  }

  const existing = await listHandoffs({
    status: ["pending", "claimed"],
    toAgent: "code_implementer",
    limit: 50,
  });
  const key = `${options.item.kind}:${options.item.repo}:${options.item.issue}`;
  if (
    existing.some(
      (h) =>
        h.work?.kind === options.item.kind &&
        String(h.work?.issue) === String(options.item.issue) &&
        h.work?.target_repo === options.item.repo,
    )
  ) {
    return null;
  }

  return createHandoff({
    from_agent: options.fromAgent,
    to_agents: ["code_implementer"],
    status: "pending",
    north_star_fit: `Remediate ${options.item.surface} ${options.item.kind}: ${options.item.title}`,
    briefing_hash: options.briefingHash,
    source_run_id: options.sourceRunId,
    work: {
      kind: options.item.kind,
      target_repo: options.item.repo,
      issue: options.item.issue,
      remediation_summary: options.item.remediation_summary,
      files_hint: options.item.files_hint,
      acceptance: options.item.acceptance,
      surface: options.item.surface,
      journeys: options.item.journeys,
    },
  });
}
