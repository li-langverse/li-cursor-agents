"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import type {
  AgentsPayload,
  QueuePayload,
  StatusPayload,
  SwarmStatistics,
} from "@/lib/types";

export type StatsRange = "1d" | "7d" | "30d" | "365d" | "all" | "custom";

export function useDashboardCore() {
  return useQuery({
    queryKey: ["dashboard", "core"],
    queryFn: async () => {
      const [status, agents, report, queue] = await Promise.all([
        apiFetch<StatusPayload>("/api/status").catch(
          (e: Error): StatusPayload => ({ error: e.message }),
        ),
        apiFetch<AgentsPayload>("/api/agents"),
        apiFetch<Record<string, unknown>>("/api/report").catch(() => ({})),
        apiFetch<QueuePayload>("/api/queue").catch(() => ({ queue: [], by_agent: {} })),
      ]);
      return { status, agents, report, queue };
    },
    refetchInterval: 4000,
  });
}

export function useStatistics(range: StatsRange, custom?: { since?: string; until?: string }) {
  const params = new URLSearchParams({ range, refresh: "1" });
  if (range === "custom" && custom?.since) params.set("since", custom.since);
  if (range === "custom" && custom?.until) params.set("until", custom.until);

  return useQuery({
    queryKey: ["dashboard", "statistics", range, custom?.since, custom?.until],
    queryFn: () =>
      apiFetch<{ statistics: SwarmStatistics | null }>(`/api/statistics?${params}`).then(
        (r) => r.statistics,
      ),
    staleTime: 30_000,
  });
}
