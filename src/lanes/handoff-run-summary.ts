import type { HandoffPhaseResult, HandoffPhaseTick } from "./run-handoff-phases.js";

function describeTick(phase: string, tick: HandoffPhaseTick["tick"]): string {
  if (tick.skipped) {
    return `${phase}: skipped (${tick.skip_reason ?? "unknown"})`;
  }
  const who = tick.agentId ?? "agent";
  return `${phase}: ${who} → ${tick.status ?? "finished"}`;
}

export function formatHandoffPhasesSummary(result: HandoffPhaseResult): string {
  const lines = result.phases.map((p) => describeTick(p.phase, p.tick));
  if (!lines.length) return "Handoff run-all: no phases executed";
  return lines.join(" · ");
}
