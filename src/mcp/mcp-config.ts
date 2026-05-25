import { existsSync } from "node:fs";
import { join } from "node:path";
/** Cursor SDK MCP server config shape (stdio). */
export type McpServerConfig = {
  type?: "stdio";
  command: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
};
import { agentsPackageRoot } from "../runner.js";
import { dbEnabled } from "../db/client.js";

export const CONTROL_PLANE_DB_MCP_ID = "li-control-plane-db";
export const CONTROL_PLANE_LIQ_MCP_ID = "li-control-plane-liq";

export function useLidbStore(): boolean {
  return process.env.LI_CONTROL_PLANE_STORE?.trim().toLowerCase() === "lidb";
}

function mcpBuiltPath(...segments: string[]): string {
  const root = agentsPackageRoot();
  const built = join(root, "dist", "mcp", ...segments);
  if (!existsSync(built)) {
    throw new Error(`Missing ${built} — run npm run build`);
  }
  return built;
}

export function controlPlaneDbMcpEntryPath(): string {
  return mcpBuiltPath("control-plane-db-mcp.js");
}

export function controlPlaneLiqMcpEntryPath(): string {
  return mcpBuiltPath("lidb-liq-mcp.js");
}

/** MCP server config for Cursor SDK when Supabase store is active. */
export function buildControlPlaneDbMcpServers(): Record<string, McpServerConfig> | undefined {
  if (process.env.LI_CONTROL_PLANE_DB_MCP === "0") return undefined;
  if (!dbEnabled() && process.env.LI_CONTROL_PLANE_DB_MCP !== "1") return undefined;

  const root = agentsPackageRoot();
  const script = controlPlaneDbMcpEntryPath();

  const env: Record<string, string> = {};
  for (const key of [
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "SUPABASE_ANON_KEY",
    "SUPABASE_DB_URL",
    "DATABASE_URL",
    "SUPABASE_DB_HOST",
    "SUPABASE_DB_PORT",
    "SUPABASE_DB_PASSWORD",
    "SUPABASE_DB_USER",
    "SUPABASE_DB_NAME",
    "LI_DB_QUERY_MAX_ROWS",
    "LI_CURSOR_AGENTS_ROOT",
    "BENCHMARKS_ROOT",
  ]) {
    const v = process.env[key];
    if (v) env[key] = v;
  }
  env.LI_CURSOR_AGENTS_ROOT = root;

  if (!env.SUPABASE_DB_URL) {
    env.SUPABASE_DB_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
  }

  return {
    [CONTROL_PLANE_DB_MCP_ID]: {
      type: "stdio",
      command: process.execPath,
      args: [script],
      cwd: root,
      env,
    },
  };
}

/** MCP server config when control-plane store is lidb (liq exploration). */
export function buildControlPlaneLiqMcpServers(): Record<string, McpServerConfig> | undefined {
  if (process.env.LI_CONTROL_PLANE_LIQ_MCP === "0") return undefined;
  if (!useLidbStore() && process.env.LI_CONTROL_PLANE_LIQ_MCP !== "1") return undefined;

  const root = agentsPackageRoot();
  const script = controlPlaneLiqMcpEntryPath();
  const env: Record<string, string> = {
    LI_CURSOR_AGENTS_ROOT: root,
    LI_CONTROL_PLANE_STORE: process.env.LI_CONTROL_PLANE_STORE?.trim() || "lidb",
  };
  for (const key of ["LI_LIDB_URL", "LI_LIDB_MOCK", "LI_DATA_DIR"]) {
    const v = process.env[key];
    if (v) env[key] = v;
  }

  return {
    [CONTROL_PLANE_LIQ_MCP_ID]: {
      type: "stdio",
      command: process.execPath,
      args: [script],
      cwd: root,
      env,
    },
  };
}
