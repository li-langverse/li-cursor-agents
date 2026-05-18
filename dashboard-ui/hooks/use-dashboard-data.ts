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

function mergeStatusWithAgentsRuntime(
  status: StatusPayload,
  agents?: AgentsPayload,
): StatusPayload {
  const agentRt = agents?.runtime;
  if (!agentRt) return status;
  return {
    ...status,
    agent_backend: status.agent_backend ?? agentRt.agent_backend,
    runtime: {
      ...agentRt,
      ...status.runtime,
      async_swarm_running:
        status.runtime?.async_swarm_running ?? agentRt.async_swarm_running,
      store: status.runtime?.store ?? agentRt.store,
      agent_backend: status.runtime?.agent_backend ?? agentRt.agent_backend,
    },
  };
}

/**
 * Split queries so a slow /api/report or /api/queue does not block agents/status UI.
 * Heavy endpoints start only after /api/agents succeeds.
 */
export function useDashboardCore() {
  const statusQ = useQuery({
    queryKey: ["dashboard", "status"],
    queryFn: async () => {
      try {
        const raw = await apiFetch<Record<string, unknown>>("/api/status", { timeoutMs: 8_000 });
        return { payload: parseStatusResponse(raw), fault: null as string | null };
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return { payload: {} as StatusPayload, fault: message };
      }
    },
    refetchInterval: 5_000,
    retry: 1,
  });

  const agentsQ = useQuery({
    queryKey: ["dashboard", "agents"],
    queryFn: async (): Promise<AgentsQueryResult> => {
      try {
        const body = await apiFetch<AgentsPayload>("/api/agents", { timeoutMs: 12_000 });
        return { payload: normalizeAgentsPayload(body), fault: null };
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return { payload: normalizeAgentsPayload(undefined), fault: message };
      }
    },
    refetchInterval: 8_000,
    retry: 2,
  });

  const agentsReady =
    agentsQ.isFetched &&
    !agentsQ.data?.fault &&
    (agentsQ.data?.payload?.roster?.length ?? 0) > 0;

  const reportQ = useQuery({
    queryKey: ["dashboard", "report"],
    queryFn: () =>
      apiFetch<Record<string, unknown>>("/api/report", { timeoutMs: 20_000 }).catch(() => ({})),
    enabled: agentsReady,
    refetchInterval: 45_000,
    staleTime: 20_000,
    retry: 0,
  });

  const queueQ = useQuery({
    queryKey: ["dashboard", "queue", "light"],
    queryFn: () =>
      apiFetch<QueuePayload>("/api/queue?light=1", { timeoutMs: 15_000 }).catch(() => EMPTY_QUEUE),
    enabled: agentsReady,
    refetchInterval: 12_000,
    staleTime: 8_000,
    retry: 0,
  });

  const agentsPayload = agentsQ.data?.payload;
  const agentsFault = agentsQ.data?.fault ?? null;
  const statusPayload = statusQ.data?.payload;
  const statusFault = statusQ.data?.fault ?? null;

  const mergedStatus = useMemo(
    () => mergeStatusWithAgentsRuntime(statusPayload ?? {}, agentsPayload),
    [statusPayload, agentsPayload],
  );

  const data = useMemo(() => {
    if (!agentsQ.isFetched) return undefined;
    return {
      status: mergedStatus,
      agents: agentsPayload ?? normalizeAgentsPayload(undefined),
      report: reportQ.data ?? {},
      queue: queueQ.data ?? EMPTY_QUEUE,
    };
  }, [agentsQ.isFetched, agentsPayload, mergedStatus, reportQ.data, queueQ.data]);

  const rosterCount = agentsPayload?.roster?.length ?? 0;
  const agentsReachable = rosterCount > 0 && !agentsFault;

  const dataUpdatedAt = Math.max(
    statusQ.dataUpdatedAt,
    agentsQ.dataUpdatedAt,
    reportQ.dataUpdatedAt,
    queueQ.dataUpdatedAt,
  );

  const heavyStillLoading =
    agentsReady && (reportQ.isFetching || queueQ.isFetching) && !reportQ.data && !queueQ.data;

  return {
    data,
    isLoading: agentsQ.isPending && !agentsQ.isFetched,
    isError: Boolean(agentsFault) && rosterCount === 0,
    error: agentsFault ? new Error(agentsFault) : null,
    dataUpdatedAt: dataUpdatedAt > 0 ? dataUpdatedAt : undefined,
    isReportLoading: heavyStillLoading,
    isQueueLoading: false,
    statusFault,
    agentsFault,
    agentsReachable,
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
    refetchInterval: 12_000,
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
    refetchInterval: 8_000,
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
    refetchInterval: 15_000,
  });
}
