import type { SwarmHealthReport } from "./types.js";

/** Mirrors supervisor intervention logic for dashboards and APIs. */
export function computeSwarmDegraded(health: SwarmHealthReport): boolean {
  if (health.healthy) return false;
  if (health.remediations.length > 0) return false;
  return health.findings.some((f) => !f.auto_healable || f.severity === "critical");
}

export function degradedReasons(health: SwarmHealthReport): string[] {
  if (!computeSwarmDegraded(health)) return [];
  return health.findings
    .filter((f) => !f.auto_healable || f.severity === "critical")
    .map((f) => f.title)
    .slice(0, 6);
}
