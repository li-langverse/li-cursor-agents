"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ActivityFeed } from "@/components/activity/activity-feed";
import { RunDrawer } from "@/components/activity/run-drawer";
import { useRecentActivity } from "@/hooks/use-dashboard-data";
import type { ActivityListItem } from "@/lib/activity";

export function ActivityClient() {
  const searchParams = useSearchParams();
  const { data, isLoading, isError, error } = useRecentActivity(25);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);

  useEffect(() => {
    const run = searchParams.get("run");
    if (run) setSelectedRunId(run);
  }, [searchParams]);

  if (isLoading) return <p className="loading-block">Loading activity…</p>;
  if (isError) return <p className="error-block">{(error as Error).message}</p>;

  const items = (data?.items ?? []) as ActivityListItem[];

  return (
    <>
      <section className="panel">
        <h2>Recent runs</h2>
        <p className="hint">
          Latest agent runs with drill-downs for input prompts, assistant output, thinking, and actions taken.
          Use <strong>Full trace</strong> for the complete step log.
        </p>
        <ActivityFeed
          items={items}
          emptyMessage="No agent runs yet — start the supervisor or run an agent."
          onOpenTrace={setSelectedRunId}
        />
      </section>
      <RunDrawer runId={selectedRunId} onClose={() => setSelectedRunId(null)} />
    </>
  );
}
