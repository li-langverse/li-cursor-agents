"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useDashboardCore } from "@/hooks/use-dashboard-data";
import { FooterControls } from "@/components/shell/footer-controls";
import { Topbar } from "@/components/shell/topbar";

const NAV = [
  { href: "/", label: "Overview" },
  { href: "/agents", label: "Agents" },
  { href: "/activity", label: "Activity" },
  { href: "/statistics", label: "Statistics" },
  { href: "/interventions", label: "Interventions" },
  { href: "/heap", label: "Heap" },
  { href: "/settings", label: "Settings" },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { data, dataUpdatedAt, isLoading, isError, error, isReportLoading, isQueueLoading } =
    useDashboardCore();

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">Li Agent Swarm</div>
        <nav className="nav">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={
                pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href))
                  ? "active"
                  : ""
              }
            >
              {item.label}
            </Link>
          ))}
        </nav>
        {data?.status?.runtime ? (
          <div className="sidebar-meta hint">
            <p>Store: {data.status.runtime.store ?? "—"}</p>
            <p>SDK slots: {data.status.runtime.sdk_max_concurrent ?? "—"}</p>
            <p>Queue: {data.queue?.queue?.length ?? 0}</p>
            {data.agents?.roster?.length ? <p>Agents: {data.agents.roster.length}</p> : null}
          </div>
        ) : null}
      </aside>
      <div className="main-column">
        <Topbar status={data?.status} updatedAt={dataUpdatedAt ? new Date(dataUpdatedAt) : undefined} />
        <main className="content">
          {isLoading ? <p className="loading-block">Loading agents…</p> : null}
          {isReportLoading || isQueueLoading ? (
            <p className="hint">Refreshing briefing / work queue…</p>
          ) : null}
          {isError ? (
            <p className="error-block">
              API unreachable — run <code>npm run dashboard</code> on port 9477, then refresh.{" "}
              {(error as Error).message}
            </p>
          ) : null}
          {children}
        </main>
        <FooterControls status={data?.status} />
      </div>
    </div>
  );
}
