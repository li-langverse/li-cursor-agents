import { listHandoffs } from "./handoff-store.js";
import { validateNorthStarFit } from "./placement-validator.js";

export interface HandoffNorthStarAudit {
  open_handoffs: number;
  missing_north_star_fit: string[];
  invalid_north_star_fit: string[];
}

const OPEN_STATUSES = new Set(["pending_placement", "pending", "claimed"]);

/** Surface handoffs that violate north_star_fit policy for briefing scorecards. */
export async function auditHandoffsNorthStar(): Promise<HandoffNorthStarAudit> {
  const rows = await listHandoffs({ limit: 200 });
  const open = rows.filter((h) => OPEN_STATUSES.has(h.status));
  const missing_north_star_fit: string[] = [];
  const invalid_north_star_fit: string[] = [];

  for (const h of open) {
    const err = validateNorthStarFit(h.north_star_fit);
    if (!h.north_star_fit?.trim()) {
      missing_north_star_fit.push(h.handoff_id);
    } else if (err) {
      invalid_north_star_fit.push(`${h.handoff_id}: ${err}`);
    }
  }

  return {
    open_handoffs: open.length,
    missing_north_star_fit,
    invalid_north_star_fit,
  };
}
