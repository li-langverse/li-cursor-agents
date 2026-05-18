"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { normalizeAgentsPayload } from "@/lib/agents-payload";
import { parseStatusResponse } from "@/lib/status-payload";
import type {
  AgentsPayload,
  QueuePayload,
  StatusPayload,
  SwarmStatistics,
} from "@/lib/types";

export type StatsRange = "1d" | "7d" | "30d" | "365d" | "all" | "custom";

const EMPTY_QUEUE: QueuePayload = { queue: [], by_agent: {} };

type AgentsQueryResult = { payload: AgentsPayload; fault: string | null };

/**
 * Split queries so a slow /api/report or /api/queue does not block agents/status UI.
 */
export function useDashboardCore() {
  const statusQ = useQuery({
    queryKey: ["dashboard", "status"],
    queryFn: async () => {
      try {
        const raw = await apiFetch<Record<string, unknown>>("/api/status", { timeoutMs: 10_000 });
        return { payload: parseStatusResponse(raw), fault: null as string | null };
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return { payload: {} as StatusPayload, fault: message };
      }
    },
    refetchInterval: 4000,
  });

  const agentsQ = useQuery({
    queryKey: ["dashboard", "agents"],
    queryFn: async (): Promise<AgentsQueryResult> => {
      try {
        const body = await apiFetch<AgentsPayload>("/api/agents", { timeoutMs: 20_000 });
        return { payload: normalizeAgentsPayload(body), fault: null };
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return { payload: normalizeAgentsPayload(undefined), fault: message };
      }
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

  const agentsPayload = agentsQ.data?.payload;
  const agentsFault = agentsQ.data?.fault ?? null;
  const statusPayload = statusQ.data?.payload;
  const statusFault = statusQ.data?.fault ?? null;

  const data = useMemo(() => {
    if (!agentsQ.isFetched) return undefined;
    return {
      status: statusPayload,
      agents: agentsPayload ?? normalizeAgentsPayload(undefined),
      report: reportQ.data ?? {},
      queue: queueQ.data ?? EMPTY_QUEUE,
    };
  }, [agentsQ.isFetched, agentsPayload, statusPayload, reportQ.data, queueQ.data]);

  const rosterCount = agentsPayload?.roster?.length ?? 0;
  const agentsReachable = rosterCount > 0 && !agentsFault;

  const dataUpdatedAt = Math.max(
    statusQ.dataUpdatedAt,
    agentsQ.dataUpdatedAt,
    reportQ.dataUpdatedAt,
    queueQ.dataUpdatedAt,
  );

  return {
    data,
    isLoading: !agentsQ.isFetched,
    isError: Boolean(agentsFault) && rosterCount === 0,
    error: agentsFault ? new Error(agentsFault) : null,
    dataUpdatedAt: dataUpdatedAt > 0 ? dataUpdatedAt : undefined,
    isReportLoading: reportQ.isLoading,
    isQueueLoading: queueQ.isLoading,
    statusFault,
    agentsFault,
    agentsReachable,
    /** True when roster loaded but /api/status failed (show soft warning, not "API degraded"). */
    statusDegraded: Boolean(statusFault) && agentsReachable,
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
