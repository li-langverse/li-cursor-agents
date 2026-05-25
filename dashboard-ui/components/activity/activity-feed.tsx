"use client";

import { ActivityCard } from "@/components/activity/activity-card";
import type { ActivityListItem } from "@/lib/activity";

export function ActivityFeed({
  items,
  compact,
  emptyMessage,
  onOpenTrace,
}: {
  items: ActivityListItem[];
  compact?: boolean;
  emptyMessage: string;
  onOpenTrace: (runId: string) => void;
}) {
  if (!items.length) {
    return <p className="empty">{emptyMessage}</p>;
  }

  return (
    <div className={`action-feed ${compact ? "compact" : ""}`}>
      {items.map((item) => (
        <ActivityCard key={item.run_id} item={item} compact={compact} onOpenTrace={onOpenTrace} />
      ))}
    </div>
  );
}
