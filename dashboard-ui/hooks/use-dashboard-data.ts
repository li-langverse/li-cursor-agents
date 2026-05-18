"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { normalizeAgentsPayload } from "@/lib/agents-payload";
import type {
  AgentsPayload,
  QueuePayload,
  StatusPayload,
  SwarmStatistics,
} from "@/lib/types";

export type StatsRange = "1d" | "7d" | "30d" | "365d" | "all" | "custom";

const EMPTY_QUEUE: QueuePayload = { queue: [], by_agent: {} };

/**
 * Split queries so a slow /api/report or /api/queue does not block agents/status UI.
 * (Previously Promise.all kept `data` undefined while /api/agents was already 200.)
 */
export function useDashboardCore() {
  const statusQ = useQuery({
    queryKey: ["dashboard", "status"],
    queryFn: () =>
      apiFetch<StatusPayload>("/api/status", { timeoutMs: 15_000 }).catch(
        (e: Error): StatusPayload => ({ error: e.message }),
      ),
    refetchInterval: 4000,
  });

  const agentsQ = useQuery({
    queryKey: ["dashboard", "agents"],
    queryFn: async () => {
      const body = await apiFetch<AgentsPayload>("/api/agents", { timeoutMs: 15_000 }).catch(
        (): AgentsPayload => ({ total: 0, roster: [] }),
      );
      return normalizeAgentsPayload(body);
    },
    refetchInterval: 4000,
  });

  const reportQ = useQuery({
    queryKey: ["dashboard", "report"],
    queryFn: () =>
      apiFetch<Record<string, unknown>>("/api/report", { timeoutMs: 25_000 }).catch(() => ({})),
    refetchInterval: 30_000,
    staleTime: 15_000,
  });

  const queueQ = useQuery({
    queryKey: ["dashboard", "queue"],
    queryFn: () =>
      apiFetch<QueuePayload>("/api/queue", { timeoutMs: 30_000 }).catch(() => EMPTY_QUEUE),
    refetchInterval: 4000,
  });

  const data = useMemo(() => {
    if (!agentsQ.isSuccess) return undefined;
    return {
      status: statusQ.data,
      agents: agentsQ.data ?? normalizeAgentsPayload(undefined),
      report: reportQ.data ?? {},
      queue: queueQ.data ?? EMPTY_QUEUE,
    };
  }, [agentsQ.isSuccess, agentsQ.data, statusQ.data, reportQ.data, queueQ.data]);

  const dataUpdatedAt = Math.max(
    statusQ.dataUpdatedAt,
    agentsQ.dataUpdatedAt,
    reportQ.dataUpdatedAt,
    queueQ.dataUpdatedAt,
  );

  return {
    data,
    isLoading: agentsQ.isLoading && !agentsQ.data,
    isError: agentsQ.isError,
    error: agentsQ.error,
    dataUpdatedAt: dataUpdatedAt > 0 ? dataUpdatedAt : undefined,
    isReportLoading: reportQ.isLoading,
    isQueueLoading: queueQ.isLoading,
  };
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
