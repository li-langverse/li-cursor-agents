import type { ReactNode } from "react";

export function Badge({
  children,
  tone = "default",
  title,
}: {
  children: ReactNode;
  tone?: "default" | "ok" | "warn" | "danger" | "accent";
  title?: string;
}) {
  return (
    <span className={`badge badge-${tone}`} title={title}>
      {children}
    </span>
  );
}

export function StatusDot({ status }: { status: string }) {
  return <span className={`status-dot status-${status}`} title={status} />;
}
