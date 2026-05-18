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
        apiFetch<AgentsPayload>("/api/agents").catch(
          (): AgentsPayload => ({ total: 0, roster: [] }),
        ),
        apiFetch<Record<string, unknown>>("/api/report").catch(() => ({})),
        apiFetch<QueuePayload>("/api/queue").catch(() => ({ queue: [], by_agent: {} })),
      ]);
      return { status, agents, report, queue };
    },
    refetchInterval: 4000,
  });
}

export function useStatistics(
  range: StatsRange,
  custom?: { since?: string; until?: string },
  options?: { refresh?: boolean },
) {
  const params = new URLSearchParams({ range });
  if (options?.refresh) params.set("refresh", "1");
  if (range === "custom" && custom?.since) params.set("since", custom.since);
  if (range === "custom" && custom?.until) params.set("until", custom.until);

  return useQuery({
    queryKey: ["dashboard", "statistics", range, custom?.since, custom?.until, options?.refresh],
    queryFn: async () => {
      const body = await apiFetch<{ statistics: SwarmStatistics | null; error?: string }>(
        `/api/statistics?${params}`,
      );
      if (body.error && !body.statistics) {
        throw new Error(body.error);
      }
      return body.statistics;
    },
    staleTime: 60_000,
    retry: 1,
  });
}

export function useInterventions() {
  return useQuery({
    queryKey: ["interventions"],
    queryFn: () =>
      apiFetch<{
        interventions: Array<{
          id?: string;
          severity: string;
          title: string;
          detail: string;
          action?: string;
        }>;
        stale_warning?: string;
      }>("/api/interventions"),
    refetchInterval: 8000,
  });
}

export function useRecentActivity(limit = 25) {
  return useQuery({
    queryKey: ["activity", limit],
    queryFn: () =>
      apiFetch<{
        items: Array<{
          run_id: string;
          agent_id: string;
          status: string;
          started_at: string;
          action_summary?: string;
        }>;
      }>(`/api/activity/recent?limit=${limit}`),
    refetchInterval: 5000,
  });
}

export function useHeapPlan() {
  return useQuery({
    queryKey: ["heap"],
    queryFn: () =>
      apiFetch<{
        heap_plan?: { flat_tasks?: Array<{ agent: string; coordinator: string; reason: string }> };
        org_roadmap?: Record<string, unknown>;
      }>("/api/heap"),
    refetchInterval: 10_000,
  });
}
