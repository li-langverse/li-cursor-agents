/**
 * Mock **liq** read path for control-plane exploration (PH-DB-2 / PH-DB-10).
 *
 * Real engine: compiled Lang→IR→SQL via lidb `liq` with catalog-bound identifiers.
 * Until `LI_CONTROL_PLANE_STORE=lidb` + `lis db start`, this module returns stub rows
 * so MCP and unit tests can exercise allowlist + query shape without Postgres.
 *
 * Prefer this path over `runReadOnlyQuery` when agents explore the control plane;
 * see `src/mcp/lidb-liq-mcp.ts` and `docs/plans/lidb-migration-control-plane.md`.
 */
import { CONTROL_PLANE_TABLES, schemaMarkdown } from "./schema-catalog.js";
import { runLidbBridge, shouldUseLidbEngine } from "./lidb-liorm.js";

export type LiqQueryResult = {
  ok: boolean;
  mock?: boolean;
  liq?: string;
  table?: string;
  rows?: Record<string, unknown>[];
  row_count?: number;
  truncated?: boolean;
  error?: string;
};

export type SchemaSnapshot = ReturnType<typeof schemaSnapshot>;

/** Catalog snapshot for MCP `schema_snapshot` (same tables as Supabase migrations). */
export function schemaSnapshot(engineConnected = false): {
  store: "mock-lidb" | "lidb";
  tables: typeof CONTROL_PLANE_TABLES;
  markdown: string;
} {
  return {
    store: engineConnected ? "lidb" : "mock-lidb",
    tables: CONTROL_PLANE_TABLES,
    markdown: schemaMarkdown(),
  };
}

const ALLOWED = new Set(CONTROL_PLANE_TABLES.map((t) => t.name));

const FORBIDDEN =
  /\b(insert|update|delete|drop|alter|create|truncate|grant|revoke|merge|replace|into)\b/i;

/** Minimal liq surface: `read <table> [limit N]` (case-insensitive). */
export function parseReadLiq(liq: string): { ok: true; table: string; limit: number } | { ok: false; error: string } {
  const trimmed = liq.trim();
  if (!trimmed) return { ok: false, error: "empty liq query" };
  if (FORBIDDEN.test(trimmed)) return { ok: false, error: "mutating liq not allowed" };
  const m = trimmed.match(/^read\s+([a-z_][a-z0-9_]*)\s*(?:limit\s+(\d+))?$/i);
  if (!m) {
    return {
      ok: false,
      error: 'liq must match: read <table> [limit N] (e.g. read agent_runs limit 20)',
    };
  }
  const table = m[1]!.toLowerCase();
  if (!ALLOWED.has(table)) return { ok: false, error: `table not in control-plane catalog: ${table}` };
  const limit = m[2] != null ? Math.min(200, Math.max(1, Number(m[2]))) : 20;
  return { ok: true, table, limit };
}

function mockRowsForTable(table: string, limit: number): Record<string, unknown>[] {
  const meta = CONTROL_PLANE_TABLES.find((t) => t.name === table);
  const keys = meta?.key_columns ?? ["id"];
  const row: Record<string, unknown> = { _mock: true, _note: "lidb engine not wired — stub row" };
  for (const k of keys) row[k] = k === "id" || k.endsWith("_id") ? "mock-id" : k.includes("at") ? new Date(0).toISOString() : null;
  return [row].slice(0, limit);
}

/** Run liq read query — real liorm when engine probes ok; else mock harness. */
export async function runLiqQuery(liq: string): Promise<LiqQueryResult> {
  const parsed = parseReadLiq(liq);
  if (!parsed.ok) return { ok: false, error: parsed.error, liq };

  const useEngine = await shouldUseLidbEngine();
  if (useEngine) {
    const bridge = await runLidbBridge("read_liq", liq);
    if (bridge.ok && bridge.rows) {
      const rows = bridge.rows.slice(0, parsed.limit);
      return {
        ok: true,
        mock: false,
        liq,
        table: parsed.table,
        rows,
        row_count: rows.length,
        truncated: bridge.rows.length > parsed.limit,
      };
    }
    return {
      ok: false,
      error: bridge.error ?? "lidb liorm read failed",
      liq,
      table: parsed.table,
    };
  }

  const rows = mockRowsForTable(parsed.table, parsed.limit);
  return {
    ok: true,
    mock: true,
    liq,
    table: parsed.table,
    rows,
    row_count: rows.length,
    truncated: false,
  };
}

export async function describeTableLiq(table: string): Promise<LiqQueryResult> {
  if (!ALLOWED.has(table)) return { ok: false, error: `table not allowed: ${table}` };
  const meta = CONTROL_PLANE_TABLES.find((t) => t.name === table)!;
  const rows = meta.key_columns.map((column_name) => ({
    column_name,
    data_type: "unknown",
    is_nullable: "YES",
    _mock: true,
  }));
  return { ok: true, mock: true, table, rows, row_count: rows.length };
}
