"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { apiPost } from "@/lib/api";
import type { StatusPayload } from "@/lib/types";

export function Topbar({
  status,
  updatedAt,
}: {
  status?: StatusPayload;
  updatedAt?: Date;
}) {
  const qc = useQueryClient();
  const runtime = status?.runtime;
  const swarmOn = Boolean(runtime?.async_swarm_running);
  const backend = status?.agent_backend ?? runtime?.agent_backend ?? "cursor-sdk";

  const refreshBriefing = useMutation({
    mutationFn: () => apiPost("/api/briefing/refresh"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["dashboard"] }),
  });

  return (
    <header className="topbar">
      <div className="topbar-left">
        <h1>Li Agent Swarm</h1>
        <p className="subtitle">Control plane dashboard (Next.js)</p>
      </div>
      <div className="topbar-right">
        <Badge tone={backend === "mock" ? "warn" : "ok"}>{backend}</Badge>
        <Badge tone={swarmOn ? "ok" : "default"}>{swarmOn ? "swarm on" : "swarm off"}</Badge>
        {status?.error ? <Badge tone="danger">API degraded</Badge> : null}
        <span className="updated">{updatedAt ? updatedAt.toLocaleTimeString() : ""}</span>
        <Button
          variant="ghost"
          size="sm"
          loading={refreshBriefing.isPending}
          onClick={() => refreshBriefing.mutate()}
        >
          Refresh briefing
        </Button>
        <Button variant="ghost" size="sm" onClick={() => qc.invalidateQueries({ queryKey: ["dashboard"] })}>
          ↻
        </Button>
      </div>
    </header>
  );
}
