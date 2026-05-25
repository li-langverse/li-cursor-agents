import { listHandoffs, updateHandoff } from "./handoff-store.js";
import { validateNorthStarFit } from "./placement-validator.js";

/** Mark open handoffs without valid north_star_fit as failed (maintenance hygiene). */
export async function failHandoffsMissingNorthStar(): Promise<string[]> {
  const rows = await listHandoffs({ limit: 200 });
  const failed: string[] = [];
  for (const h of rows) {
    if (h.status !== "pending_placement" && h.status !== "pending" && h.status !== "claimed") {
      continue;
    }
    const err = validateNorthStarFit(h.north_star_fit);
    if (!err) continue;
    await updateHandoff(h.handoff_id, {
      status: "failed",
      completed_at: new Date().toISOString(),
      work: {
        ...h.work,
        failure_reason: err,
      },
    });
    failed.push(h.handoff_id);
  }
  return failed;
}
