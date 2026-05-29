/** Bookkeeping errors after worker/dashboard restart — not actionable task failures. */

export const STALE_RUNNING_RECONCILED = "stale_running_reconciled";
export const UNREGISTERED_RUNNING_RECONCILED = "unregistered_running_reconciled";

export const STALE_RECONCILE_ERROR_CODES = [
  STALE_RUNNING_RECONCILED,
  UNREGISTERED_RUNNING_RECONCILED,
] as const;

export type StaleReconcileErrorCode = (typeof STALE_RECONCILE_ERROR_CODES)[number];

export function isStaleReconcileError(error: string | null | undefined): boolean {
  const err = (error ?? "").trim();
  return STALE_RECONCILE_ERROR_CODES.includes(err as StaleReconcileErrorCode);
}

export function isStaleReconcileCategory(category: string | null | undefined): boolean {
  return isStaleReconcileError(category);
}
