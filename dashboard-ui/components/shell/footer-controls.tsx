"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { apiPost } from "@/lib/api";
import { invalidateDashboardQueries } from "@/lib/invalidate-dashboard";
import { Button } from "@/components/ui/button";
import type { StatusPayload } from "@/lib/types";

export function FooterControls({ status }: { status?: StatusPayload }) {
  const qc = useQueryClient();
  const swarmOn = Boolean(status?.runtime?.async_swarm_running);
  const [toast, setToast] = useState<string | null>(null);

  const invalidate = () => invalidateDashboardQueries(qc);

  const swarmMut = useMutation({
    mutationFn: async () => {
      if (swarmOn) {
        return apiPost<{ message?: string }>("/api/async-swarm/stop");
      }
      await apiPost("/api/supervisor/stop").catch(() => {});
      return apiPost<{ message?: string }>("/api/async-swarm/start", {});
    },
    onSuccess: (body) => {
      setToast(body.message ?? (swarmOn ? "Swarm stopped" : "Swarm started"));
      void invalidate();
    },
    onError: (e: Error) => setToast(e.message),
  });

  const handoffMut = useMutation({
    mutationFn: () => apiPost<{ message?: string }>("/api/swarm/run-all", {}),
    onSuccess: (body) => {
      setToast(body.message ?? "Handoff started");
      void invalidate();
    },
    onError: (e: Error) => setToast(e.message),
  });

  return (
    <footer className="footer-controls">
      {toast ? (
        <p className="footer-toast" role="status">
          {toast}
        </p>
      ) : null}
      <Button
        variant={swarmOn ? "danger" : "primary"}
        size="sm"
        active={swarmOn}
        loading={swarmMut.isPending}
        onClick={() => swarmMut.mutate()}
      >
        {swarmOn ? "Stop agents" : "Start agents"}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        loading={handoffMut.isPending}
        disabled={!swarmOn && !handoffMut.isPending}
        onClick={() => handoffMut.mutate()}
        title={swarmOn ? "One-shot research → placement → implement" : "Start agents first"}
      >
        Run handoff once
      </Button>
    </footer>
  );
}
