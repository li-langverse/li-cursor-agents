import type { QueryClient } from "@tanstack/react-query";

/** Invalidate every query the Next dashboard tabs depend on. */
export function invalidateDashboardQueries(qc: QueryClient): void {
  void qc.invalidateQueries({ queryKey: ["dashboard"] });
  void qc.invalidateQueries({ queryKey: ["heap"] });
  void qc.invalidateQueries({ queryKey: ["interventions"] });
  void qc.invalidateQueries({ queryKey: ["activity"] });
  void qc.invalidateQueries({ queryKey: ["dashboard", "statistics"] });
}
