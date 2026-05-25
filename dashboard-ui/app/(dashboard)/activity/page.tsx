import { Suspense } from "react";
import { ActivityClient } from "./activity-client";

export default function ActivityPage() {
  return (
    <Suspense fallback={<p className="loading-block">Loading activity…</p>}>
      <ActivityClient />
    </Suspense>
  );
}
