import type { AgentHandoff, PackagePlacement } from "./types.js";
import { validatePackagePlacement } from "./placement-validator.js";
import { updateHandoff } from "./handoff-store.js";

const GOVERNANCE_REPOS = new Set(["roadmap"]);

export function validatePlacementGovernance(
  placement: PackagePlacement,
  handoff?: Pick<AgentHandoff, "work">,
): string | null {
  const target = placement.target.toLowerCase();
  if (GOVERNANCE_REPOS.has(target) || target.includes("li-langverse/roadmap")) {
    if (placement.action !== "issue_only") {
      return "roadmap governance repo — use issue_only or human merge";
    }
  }

  if (placement.action === "create_official") {
    const pkg = placement.pkg_id ?? "";
    if (!/^PKG-[\w-]+$/i.test(pkg)) {
      return "create_official requires pkg_id like PKG-li-std-example";
    }
  }

  const work = handoff?.work ?? {};
  if (work.trusted_lean_proposed === true && work.trusted_change_approved !== true) {
    return "trusted.lean change requires work.trusted_change_approved and human issue label";
  }

  if (placement.path?.includes("trusted.lean") && placement.action !== "issue_only") {
    if (work.trusted_change_approved !== true) {
      return "direct trusted.lean edits blocked without trusted-change-approved";
    }
  }

  return null;
}

export function validatePlacementFull(
  placement: PackagePlacement,
  handoff?: Pick<AgentHandoff, "work">,
): string[] {
  return [
    validatePackagePlacement(placement),
    validatePlacementGovernance(placement, handoff),
  ].filter((e): e is string => Boolean(e));
}

/** Apply architect placement with governance gates; returns errors or updated handoff. */
export async function applyPlacementDecision(
  handoffId: string,
  placement: PackagePlacement,
  handoff?: AgentHandoff,
): Promise<{ ok: true; handoff: AgentHandoff } | { ok: false; errors: string[] }> {
  const errors = validatePlacementFull(placement, handoff);
  if (errors.length) {
    await updateHandoff(handoffId, {
      work: {
        ...(handoff?.work ?? {}),
        placement_validator_errors: errors,
        placement_attempt_at: new Date().toISOString(),
      },
    });
    return { ok: false, errors };
  }

  const updated = await updateHandoff(handoffId, {
    package_placement: { ...placement, decided_by: placement.decided_by ?? "package_architect" },
    status: "pending",
    work: {
      ...(handoff?.work ?? {}),
      placement_validator_errors: [],
      placement_decided_at: new Date().toISOString(),
    },
  });
  if (!updated) return { ok: false, errors: ["handoff not found"] };
  return { ok: true, handoff: updated };
}
