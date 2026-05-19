/** Parallel per-agent research workers (default on). Set LI_RESEARCH_PARALLEL=0 for legacy serial lane. */

export function researchParallelEnabled(): boolean {
  const v = process.env.LI_RESEARCH_PARALLEL?.trim().toLowerCase();
  if (v === "0" || v === "false") return false;
  return true;
}

export function researchAgentIdleMs(agentId: string): number {
  const base = Number(process.env.LI_RESEARCH_AGENT_IDLE_MS ?? process.env.LI_RESEARCH_LANE_INTERVAL_MS ?? 90_000);
  const idle = Number.isFinite(base) && base >= 5_000 ? base : 90_000;
  let h = 0;
  for (let i = 0; i < agentId.length; i++) h = (h * 31 + agentId.charCodeAt(i)) | 0;
  const stagger = Math.abs(h) % 20_000;
  return idle + stagger;
}
