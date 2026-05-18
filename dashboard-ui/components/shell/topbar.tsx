"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { apiPost } from "@/lib/api";
import { invalidateDashboardQueries } from "@/lib/invalidate-dashboard";
import type { StatusPayload } from "@/lib/types";

export function Topbar({
  status,
  updatedAt,
  statusFault,
  agentsFault,
  agentsReachable,
}: {
  status?: StatusPayload;
  updatedAt?: Date;
  statusFault?: string | null;
  agentsFault?: string | null;
  agentsReachable?: boolean;
}) {
  const qc = useQueryClient();
  const runtime = status?.runtime;
  const swarmOn = Boolean(runtime?.async_swarm_running);
  const backend = status?.agent_backend ?? runtime?.agent_backend;
  const statusKnown = !statusFault || Boolean(runtime || backend);

  const refreshBriefing = useMutation({
    mutationFn: () => apiPost("/api/briefing/refresh"),
    onSuccess: () => invalidateDashboardQueries(qc),
  });

  return (
    <header className="topbar">
      <div className="topbar-left">
        <h1>Li Agent Swarm</h1>
        <p className="subtitle">Control plane dashboard (Next.js)</p>
      </div>
      <div className="topbar-right">
        {backend ? (
          <Badge tone={backend === "mock" ? "warn" : "ok"}>{backend}</Badge>
        ) : null}
        <Badge tone={swarmOn ? "ok" : agentsReachable ? "default" : "warn"}>
          {swarmOn ? "swarm on" : agentsReachable ? "swarm off" : "swarm unknown"}
        </Badge>
        {agentsFault && !agentsReachable ? (
          <Badge tone="danger" title={agentsFault}>
            Agents API down
          </Badge>
        ) : !agentsReachable && !agentsFault ? (
          <Badge tone="warn">Connecting…</Badge>
        ) : statusFault && agentsReachable ? (
          <Badge tone="warn" title={statusFault}>
            Status poll slow
          </Badge>
        ) : !statusKnown && !agentsReachable ? (
          <Badge tone="danger" title={statusFault ?? agentsFault ?? undefined}>
            Control plane unreachable
          </Badge>
        ) : null}
        <span className="updated">{updatedAt ? updatedAt.toLocaleTimeString() : ""}</span>
        <Button
          variant="ghost"
          size="sm"
          loading={refreshBriefing.isPending}
          onClick={() => refreshBriefing.mutate()}
        >
          Refresh briefing
        </Button>
        <Button variant="ghost" size="sm" onClick={() => invalidateDashboardQueries(qc)}>
          ↻
        </Button>
      </div>
    </header>
  );
}
