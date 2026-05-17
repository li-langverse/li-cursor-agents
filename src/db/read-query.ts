import pg from "pg";
import { CONTROL_PLANE_TABLES } from "./schema-catalog.js";

const ALLOWED_TABLES = new Set(CONTROL_PLANE_TABLES.map((t) => t.name));

const FORBIDDEN =
  /\b(insert|update|delete|drop|alter|create|truncate|grant|revoke|copy|call|execute|merge|replace|into|set\s+role|pg_sleep|lo_import|dblink)\b/i;

export interface ReadQueryResult {
  ok: boolean;
  rows?: Record<string, unknown>[];
  row_count?: number;
  fields?: string[];
  error?: string;
  truncated?: boolean;
}

export function validateReadOnlySql(sql: string): { ok: true; sql: string } | { ok: false; error: string } {
  const trimmed = sql.trim().replace(/;+\s*$/, "");
  if (!trimmed) return { ok: false, error: "empty query" };
  if (trimmed.includes(";")) return { ok: false, error: "only one statement allowed" };
  if (FORBIDDEN.test(trimmed)) return { ok: false, error: "only read-only SELECT/WITH/EXPLAIN queries allowed" };
  const head = trimmed.slice(0, 24).toLowerCase();
  if (!head.startsWith("select") && !head.startsWith("with") && !head.startsWith("explain")) {
    return { ok: false, error: "query must start with SELECT, WITH, or EXPLAIN" };
  }
  return { ok: true, sql: trimmed };
}

export function resolvePostgresUrl(): string | undefined {
  const explicit =
    process.env.SUPABASE_DB_URL?.trim() ||
    process.env.DATABASE_URL?.trim() ||
    process.env.POSTGRES_URL?.trim();
  if (explicit) return explicit;
  const port = process.env.SUPABASE_DB_PORT?.trim() || "54322";
  const password = process.env.SUPABASE_DB_PASSWORD?.trim() || "postgres";
  const user = process.env.SUPABASE_DB_USER?.trim() || "postgres";
  const host = process.env.SUPABASE_DB_HOST?.trim() || "127.0.0.1";
  const db = process.env.SUPABASE_DB_NAME?.trim() || "postgres";
  return `postgresql://${user}:${password}@${host}:${port}/${db}`;
}

export async function runReadOnlyQuery(
  sql: string,
  options?: { maxRows?: number; timeoutMs?: number },
): Promise<ReadQueryResult> {
  const maxRows = options?.maxRows ?? Number(process.env.LI_DB_QUERY_MAX_ROWS ?? 200);
  const timeoutMs = options?.timeoutMs ?? Number(process.env.LI_DB_QUERY_TIMEOUT_MS ?? 15_000);

  const validated = validateReadOnlySql(sql);
  if (!validated.ok) return { ok: false, error: validated.error };

  const url = resolvePostgresUrl();
  if (!url) {
    return {
      ok: false,
      error: "no Postgres URL (set SUPABASE_DB_URL or run npm run db:ensure)",
    };
  }

  const client = new pg.Client({ connectionString: url, statement_timeout: timeoutMs });
  try {
    await client.connect();
    const result = await client.query(validated.sql);
    const rows = (result.rows ?? []) as Record<string, unknown>[];
    const truncated = rows.length > maxRows;
    const slice = truncated ? rows.slice(0, maxRows) : rows;
    return {
      ok: true,
      rows: slice,
      row_count: slice.length,
      fields: result.fields?.map((f) => f.name) ?? [],
      truncated,
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  } finally {
    await client.end().catch(() => undefined);
  }
}

export async function describeTable(table: string): Promise<ReadQueryResult> {
  if (!ALLOWED_TABLES.has(table)) {
    return { ok: false, error: `table not allowed: ${table}` };
  }
  return runReadOnlyQuery(
    `SELECT column_name, data_type, is_nullable
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = '${table.replace(/'/g, "''")}'
     ORDER BY ordinal_position`,
  );
}
