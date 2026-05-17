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

export function controlPlaneDbMcpEntryPath(): string {
  const root = agentsPackageRoot();
  const built = join(root, "dist", "mcp", "control-plane-db-mcp.js");
  if (!existsSync(built)) {
    throw new Error(`Missing ${built} — run npm run build`);
  }
  return built;
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
