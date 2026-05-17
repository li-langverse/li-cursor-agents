/** Build implementation work queue from briefing for code_implementer / bug_fixer. */

export interface WorkQueueItem {
  kind?: string;
  repo?: string;
  number?: number;
  url?: string;
  title?: string;
  reason?: string;
  ph_id?: string;
  module?: string;
}

export interface ImplementationQueue {
  work_queue: WorkQueueItem[];
  sources: string[];
}

export function buildImplementationQueue(briefing: unknown): ImplementationQueue {
  if (!briefing || typeof briefing !== "object") {
    return { work_queue: [], sources: [] };
  }
  const b = briefing as Record<string, unknown>;
  const items: WorkQueueItem[] = [];
  const sources: string[] = [];

  const ciBug = b.ci_bug_triage as Record<string, unknown> | undefined;
  if (ciBug?.work_queue && Array.isArray(ciBug.work_queue)) {
    sources.push("ci_bug_triage");
    for (const row of ciBug.work_queue.slice(0, 8)) {
      if (row && typeof row === "object") items.push(row as WorkQueueItem);
    }
  }

  const explorer = b.ecosystem_explorer as Record<string, unknown> | undefined;
  const missing = explorer?.missing_std_modules;
  if (Array.isArray(missing)) {
    sources.push("ecosystem_explorer.missing_std");
    for (const m of missing.slice(0, 5)) {
      if (typeof m === "string") {
        items.push({ kind: "std_gap", repo: "lic", module: m, reason: `missing std: ${m}` });
      } else if (m && typeof m === "object") {
        const o = m as Record<string, unknown>;
        items.push({
          kind: "std_gap",
          repo: "lic",
          module: String(o.module ?? "?"),
          ph_id: String(o.ph_id ?? ""),
          reason: String(o.status ?? "missing std module"),
        });
      }
    }
  }

  const plan = b.plan_completion_audit as Record<string, unknown> | undefined;
  const findings = plan?.findings;
  if (Array.isArray(findings)) {
    sources.push("plan_completion_audit");
    for (const f of findings.slice(0, 4)) {
      if (f && typeof f === "object") {
        const row = f as Record<string, unknown>;
        items.push({
          kind: "plan_gap",
          repo: "lic",
          reason: String(row.message ?? row.item ?? "plan audit finding"),
          ph_id: String(row.ph_id ?? ""),
        });
      }
    }
  }

  const sec = b.security_cwe_audit as Record<string, unknown> | undefined;
  const gaps = sec?.catalog_gaps;
  if (Array.isArray(gaps)) {
    sources.push("security_cwe_audit");
    for (const g of gaps.slice(0, 3)) {
      if (g && typeof g === "object") {
        const row = g as Record<string, unknown>;
        items.push({
          kind: "cwe_gap",
          repo: "lic",
          reason: `CWE ${row.cwe ?? "?"}: ${row.reason ?? "catalog gap"}`,
        });
      }
    }
  }

  return { work_queue: items.slice(0, 12), sources };
}

export function buildImplementationQueueInstruction(queue: ImplementationQueue): string {
  if (queue.work_queue.length === 0) {
    return [
      "## Implementation queue",
      "",
      "_No queued implementation items — run full preflight or check gap_explorer output._",
    ].join("\n");
  }
  const lines = [
    "## Implementation queue",
    "",
    `Sources: ${queue.sources.join(", ") || "briefing"}`,
    "",
    "| # | Kind | Repo | Reason |",
    "|--:|------|------|--------|",
  ];
  queue.work_queue.forEach((w, i) => {
    lines.push(
      `| ${i + 1} | ${w.kind ?? "—"} | ${w.repo ?? "—"} | ${(w.reason ?? w.title ?? "").slice(0, 80)} |`,
    );
  });
  lines.push(
    "",
    "Implement **at most 2** items. Post-hook commits+pushes each run; set `LI_REPO_WORKFLOW_OPEN_PR=1` to open the PR when done.",
  );
  return lines.join("\n");
}
