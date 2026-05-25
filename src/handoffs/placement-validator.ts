import type { AgentHandoff, PackagePlacement } from "./types.js";

const VALID_ACTIONS = new Set([
  "extend_existing",
  "create_monorepo",
  "create_official",
  "extend_std",
  "issue_only",
]);

export function validateNorthStarFit(fit: string | undefined): string | null {
  if (!fit?.trim()) return "north_star_fit is required on handoffs";
  if (fit.trim().length < 12) return "north_star_fit too short — cite domain and PH/pillar";
  return null;
}

export function validatePackagePlacement(placement: PackagePlacement | null | undefined): string | null {
  if (!placement) return "package_placement is required";
  if (!VALID_ACTIONS.has(placement.action)) return `invalid placement action: ${placement.action}`;
  if (!placement.target?.trim()) return "package_placement.target is required";
  if (!placement.rationale?.trim()) return "package_placement.rationale is required";
  return null;
}

export function handoffReadyForImplement(handoff: AgentHandoff): boolean {
  if (handoff.status !== "pending" && handoff.status !== "claimed") return false;
  if (validateNorthStarFit(handoff.north_star_fit)) return false;
  if (
    handoff.work?.kind === "goal_implementation" ||
    handoff.work?.kind === "ui_remediation" ||
    handoff.work?.kind === "ux_remediation" ||
    (handoff.work?.implementation_from_research === true &&
      typeof handoff.work.goal_scaffold_path === "string")
  ) {
    return !validateNorthStarFit(handoff.north_star_fit);
  }
  if (handoff.status === "pending" && !handoff.package_placement) return false;
  if (handoff.package_placement && validatePackagePlacement(handoff.package_placement)) {
    return false;
  }
  return true;
}

export function handoffNeedsArchitect(handoff: AgentHandoff): boolean {
  return handoff.status === "pending_placement" && !handoff.package_placement;
}
