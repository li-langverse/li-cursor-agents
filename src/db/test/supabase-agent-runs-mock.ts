import type { SupabaseClient } from "@supabase/supabase-js";

export type AgentRunMockRow = {
  run_id: string;
  agent_id: string;
  status: string;
  started_at: string;
  updated_at: string;
  finished_at: string | null;
  error: string | null;
};

type Filter = { col: string; op: "eq" | "lt" | "in"; value: unknown };

function matches(row: AgentRunMockRow, filters: Filter[]): boolean {
  return filters.every((f) => {
    const v = row[f.col as keyof AgentRunMockRow];
    if (f.op === "eq") return v === f.value;
    if (f.op === "lt") return String(v) < String(f.value);
    if (f.op === "in") return Array.isArray(f.value) && (f.value as unknown[]).includes(v);
    return false;
  });
}

/** Minimal Supabase client mock for `agent_runs` reconcile/list queries. */
export function createAgentRunsSupabaseMock(initial: AgentRunMockRow[]): SupabaseClient {
  const rows = initial;

  function from(table: string) {
    if (table !== "agent_runs") {
      throw new Error(`mock supabase: unsupported table ${table}`);
    }

    let filters: Filter[] = [];
    let selectCols = "*";
    let orderCol: string | null = null;
    let orderAsc = false;
    let limitN: number | null = null;
    let updatePayload: Record<string, unknown> | null = null;

    const runQuery = (): { data: unknown; error: null } => {
      if (updatePayload) {
        const matched = rows.filter((r) => matches(r, filters));
        for (const row of matched) {
          Object.assign(row, updatePayload);
        }
        return { data: null, error: null };
      }

      let list = rows.filter((r) => matches(r, filters));
      if (orderCol) {
        list = [...list].sort((a, b) => {
          const av = String(a[orderCol as keyof AgentRunMockRow] ?? "");
          const bv = String(b[orderCol as keyof AgentRunMockRow] ?? "");
          return orderAsc ? av.localeCompare(bv) : bv.localeCompare(av);
        });
      }
      if (limitN != null) list = list.slice(0, limitN);

      if (selectCols === "run_id") {
        return { data: list.map((r) => ({ run_id: r.run_id })), error: null };
      }
      return { data: list, error: null };
    };

    const builder = {
      select(cols: string) {
        selectCols = cols;
        return builder;
      },
      eq(col: string, value: unknown) {
        filters.push({ col, op: "eq", value });
        return builder;
      },
      lt(col: string, value: unknown) {
        filters.push({ col, op: "lt", value });
        return builder;
      },
      in(col: string, value: unknown) {
        filters.push({ col, op: "in", value });
        return builder;
      },
      order(col: string, opts?: { ascending?: boolean }) {
        orderCol = col;
        orderAsc = opts?.ascending ?? false;
        return builder;
      },
      limit(n: number) {
        limitN = n;
        return builder;
      },
      update(payload: Record<string, unknown>) {
        updatePayload = payload;
        return builder;
      },
      async maybeSingle() {
        const { data } = runQuery();
        const list = Array.isArray(data) ? data : [];
        return { data: list[0] ?? null, error: null };
      },
      then(
        resolve: (v: { data: unknown; error: null }) => void,
        reject?: (e: unknown) => void,
      ) {
        try {
          resolve(runQuery());
        } catch (e) {
          reject?.(e);
        }
      },
    };
    return builder;
  }

  return { from } as unknown as SupabaseClient;
}
