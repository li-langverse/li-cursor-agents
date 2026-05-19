import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { enrichBriefingWithScorecards } from "./swarm-scorecard.js";
import { auditHandoffsNorthStar } from "../handoffs/handoff-audit.js";
import { mergeSwarmRecommendations } from "./swarm-recommendations.js";
import {
  mergeRemediationQueueFromManifest,
  mergeUxAuditRecommendations,
} from "./ux-audit-recommendations.js";
import { mergeHandoffsIntoImplementationQueue } from "../preflight/implementation-queue-handoffs.js";

export async function enrichBriefingObject(
  briefing: Record<string, unknown> | null,
): Promise<Record<string, unknown>> {
  const enriched = await enrichBriefingWithScorecards(briefing);
  enriched.handoff_audit = await auditHandoffsNorthStar();
  enriched.implementation_queue = await mergeHandoffsIntoImplementationQueue(enriched);
  enriched.swarm_enriched_at = new Date().toISOString();
  let out = mergeSwarmRecommendations(enriched);
  out = mergeUxAuditRecommendations(out);
  out = mergeRemediationQueueFromManifest(out);
  return out;
}

export interface EnrichBriefingFileResult {
  ok: boolean;
  briefing_path: string;
  keys_added: string[];
  error?: string;
}

/** Read agent-briefing.json, merge swarm scorecards + handoff audit, write back. */
export async function enrichBriefingFile(options: {
  benchmarksRoot: string;
  briefingPath?: string;
  mirrorToAgentsPackage?: boolean;
}): Promise<EnrichBriefingFileResult> {
  const briefingPath =
    options.briefingPath ?? join(options.benchmarksRoot, "data", "latest", "agent-briefing.json");

  if (!existsSync(briefingPath)) {
    return { ok: false, briefing_path: briefingPath, keys_added: [], error: "briefing file missing" };
  }

  const raw = JSON.parse(readFileSync(briefingPath, "utf8")) as Record<string, unknown>;
  const enriched = await enrichBriefingObject(raw);

  mkdirSync(dirname(briefingPath), { recursive: true });
  writeFileSync(briefingPath, `${JSON.stringify(enriched, null, 2)}\n`, "utf8");

  const keys_added = ["swarm_scorecard", "research_goals_status", "handoff_audit", "swarm_enriched_at"];
  if (enriched.provability_scorecard) keys_added.push("provability_scorecard");
  if (enriched.implementation_queue) keys_added.push("implementation_queue");

  if (options.mirrorToAgentsPackage !== false) {
    const { agentsPackageRoot } = await import("../runner.js");
    const mirrorDir = join(agentsPackageRoot(), "data", "latest");
    mkdirSync(mirrorDir, { recursive: true });
    writeFileSync(join(mirrorDir, "agent-briefing.json"), `${JSON.stringify(enriched, null, 2)}\n`, "utf8");
  }

  return { ok: true, briefing_path: briefingPath, keys_added };
}
