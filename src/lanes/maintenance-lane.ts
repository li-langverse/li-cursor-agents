import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { agentsPackageRoot } from "../runner.js";
import { enrichBriefingObject } from "../briefing/enrich-briefing-file.js";
import { failHandoffsMissingNorthStar } from "../handoffs/handoff-hygiene.js";
import { resolveBenchmarksRoot, runPreflight } from "../preflight.js";
import { dispatchSwarmAuditRefresh } from "../benchmarks/dispatch-swarm-audit.js";
import { liveBriefingHash } from "../control-plane/live-interventions.js";
import { loadState } from "../control-plane/state.js";
import { buildAgentWorkQueue } from "../control-plane/agent-work-queue.js";
import { loadLaneState, saveLaneState } from "./lane-state.js";

export interface MaintenanceLaneTickResult {
  ok: boolean;
  briefing_path?: string;
  skip_reason?: string;
  benchmarks_dispatch?: { ok: boolean; skipped?: boolean; skip_reason?: string; error?: string };
}

/** Refresh briefing snapshot + scorecards without spawning an LLM agent. */
export async function maintenanceLaneTick(options?: {
  benchmarksRoot?: string;
  skipSlowPreflight?: boolean;
}): Promise<MaintenanceLaneTickResult> {
  const lane = loadLaneState();
  if (process.env.LI_MAINTENANCE_LANE_ENABLED === "0") {
    return { ok: false, skip_reason: "maintenance lane disabled" };
  }

  const benchmarksRoot = resolveBenchmarksRoot(options?.benchmarksRoot);
  if (!benchmarksRoot) {
    return { ok: false, skip_reason: "BENCHMARKS_ROOT not found" };
  }

  const failedHandoffs = await failHandoffsMissingNorthStar();
  if (failedHandoffs.length > 0) {
    // eslint-disable-next-line no-console
    console.error(`maintenance-lane: failed ${failedHandoffs.length} handoff(s) missing north_star_fit`);
  }

  const preflight = runPreflight(benchmarksRoot, options?.skipSlowPreflight !== false);
  const raw =
    preflight.briefing && typeof preflight.briefing === "object"
      ? (preflight.briefing as Record<string, unknown>)
      : {};
  const enriched = await enrichBriefingObject(raw);

  const outDir = join(benchmarksRoot, "data", "latest");
  mkdirSync(outDir, { recursive: true });
  const briefingPath = join(outDir, "agent-briefing.json");
  writeFileSync(briefingPath, `${JSON.stringify(enriched, null, 2)}\n`, "utf8");

  const agentsDir = join(agentsPackageRoot(), "data", "latest");
  mkdirSync(agentsDir, { recursive: true });
  writeFileSync(
    join(agentsDir, "agent-briefing.json"),
    `${JSON.stringify(enriched, null, 2)}\n`,
    "utf8",
  );

  const next = loadLaneState();
  next.last_maintenance_tick_at = new Date().toISOString();
  saveLaneState(next);

  const briefingHash = liveBriefingHash(enriched);
  const cpState = { ...loadState(), last_briefing_hash: briefingHash };
  void buildAgentWorkQueue(cpState, { light: true }).catch(() => {
    /* denormalize queue rows for indexed GET /api/queue */
  });

  let benchmarks_dispatch: MaintenanceLaneTickResult["benchmarks_dispatch"];
  if (process.env.LI_BENCHMARKS_DISPATCH_ON_MAINTENANCE === "1") {
    benchmarks_dispatch = dispatchSwarmAuditRefresh({
      source: "maintenance-lane",
    });
    if (benchmarks_dispatch.skipped) {
      // eslint-disable-next-line no-console
      console.error(`maintenance-lane: benchmarks dispatch skipped — ${benchmarks_dispatch.skip_reason}`);
    } else if (!benchmarks_dispatch.ok) {
      // eslint-disable-next-line no-console
      console.error(`maintenance-lane: benchmarks dispatch failed — ${benchmarks_dispatch.error}`);
    }
  }

  return { ok: true, briefing_path: briefingPath, benchmarks_dispatch };
}

export function maintenanceLaneIntervalMs(): number {
  const n = Number(process.env.LI_MAINTENANCE_LANE_INTERVAL_MS ?? 300_000);
  return Number.isFinite(n) && n >= 30_000 ? n : 300_000;
}

export async function runMaintenanceLaneLoop(once?: boolean): Promise<void> {
  const runOnce = once ?? process.env.LI_MAINTENANCE_LANE_ONCE === "1";
  do {
    const tick = await maintenanceLaneTick();
    // eslint-disable-next-line no-console
    console.error(
      tick.ok ? `maintenance-lane: wrote ${tick.briefing_path}` : `maintenance-lane: ${tick.skip_reason}`,
    );
    if (runOnce) break;
    await new Promise((r) => setTimeout(r, maintenanceLaneIntervalMs()));
  } while (true);
}
