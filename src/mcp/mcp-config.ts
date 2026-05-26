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
import { configuredStore, dbEnabled, useLidbStore } from "../db/client.js";

export const CONTROL_PLANE_DB_MCP_ID = "li-control-plane-db";
export const CONTROL_PLANE_LIQ_MCP_ID = "li-control-plane-liq";
export const ECOSYSTEM_CONTEXT_MCP_ID = "li-ecosystem-context";

export function controlPlaneDbMcpEntryPath(): string {
  const root = agentsPackageRoot();
  const built = join(root, "dist", "mcp", "control-plane-db-mcp.js");
  if (!existsSync(built)) {
    throw new Error(`Missing ${built} — run npm run build`);
  }
  return built;
}

export function ecosystemContextMcpEntryPath(): string {
  const root = agentsPackageRoot();
  const built = join(root, "dist", "mcp", "li-ecosystem-context-mcp.js");
  if (!existsSync(built)) {
    throw new Error(`Missing ${built} — run npm run build`);
  }
  return built;
}

export function controlPlaneLiqMcpEntryPath(): string {
  const root = agentsPackageRoot();
  const built = join(root, "dist", "mcp", "lidb-liq-mcp.js");
  if (!existsSync(built)) {
    throw new Error(`Missing ${built} — run npm run build`);
  }
  return built;
}

function buildEcosystemContextMcpServer(root: string): McpServerConfig {
  return {
    type: "stdio",
    command: process.execPath,
    args: [ecosystemContextMcpEntryPath()],
    cwd: root,
    env: {
      LI_CURSOR_AGENTS_ROOT: root,
      LI_CONTROL_PLANE_STORE: process.env.LI_CONTROL_PLANE_STORE ?? "disk",
    },
  };
}

/** MCP server config for Cursor SDK when Supabase store is active. */
export function buildControlPlaneDbMcpServers(): Record<string, McpServerConfig> | undefined {
  const root = agentsPackageRoot();
  const servers: Record<string, McpServerConfig> = {};

  if (process.env.LI_ECOSYSTEM_CONTEXT_MCP !== "0") {
    servers[ECOSYSTEM_CONTEXT_MCP_ID] = buildEcosystemContextMcpServer(root);
  }

  if (process.env.LI_CONTROL_PLANE_DB_MCP === "0") {
    return Object.keys(servers).length ? servers : undefined;
  }
  if (!dbEnabled() && process.env.LI_CONTROL_PLANE_DB_MCP !== "1") {
    return Object.keys(servers).length ? servers : undefined;
  }

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

  servers[CONTROL_PLANE_DB_MCP_ID] = {
    type: "stdio",
    command: process.execPath,
    args: [script],
    cwd: root,
    env,
  };

  return servers;
}

function buildEcosystemContextForLiq(root: string): McpServerConfig {
  return {
    type: "stdio",
    command: process.execPath,
    args: [ecosystemContextMcpEntryPath()],
    cwd: root,
    env: {
      LI_CURSOR_AGENTS_ROOT: root,
      LI_CONTROL_PLANE_STORE: process.env.LI_CONTROL_PLANE_STORE ?? "lidb",
      LI_LIDB_MOCK: process.env.LI_LIDB_MOCK ?? "",
      LI_LIDB_URL: process.env.LI_LIDB_URL ?? "",
    },
  };
}

/** MCP server config when store=lidb (liq read path; PH-DB-10). */
export function buildControlPlaneLiqMcpServers(): Record<string, McpServerConfig> | undefined {
  const root = agentsPackageRoot();
  const servers: Record<string, McpServerConfig> = {};

  if (process.env.LI_ECOSYSTEM_CONTEXT_MCP !== "0") {
    servers[ECOSYSTEM_CONTEXT_MCP_ID] = buildEcosystemContextForLiq(root);
  }

  if (process.env.LI_CONTROL_PLANE_LIQ_MCP === "0") {
    return Object.keys(servers).length ? servers : undefined;
  }
  const force = process.env.LI_CONTROL_PLANE_LIQ_MCP === "1";
  if (!force && !useLidbStore()) {
    return Object.keys(servers).length ? servers : undefined;
  }

  const env: Record<string, string> = {
    LI_CURSOR_AGENTS_ROOT: root,
    LI_CONTROL_PLANE_STORE: process.env.LI_CONTROL_PLANE_STORE ?? "lidb",
  };
  for (const key of ["LI_LIDB_URL", "LI_LIDB_MOCK", "LI_DATA_DIR", "LI_DB_QUERY_MAX_ROWS"]) {
    const v = process.env[key];
    if (v) env[key] = v;
  }

  servers[CONTROL_PLANE_LIQ_MCP_ID] = {
    type: "stdio",
    command: process.execPath,
    args: [controlPlaneLiqMcpEntryPath()],
    cwd: root,
    env,
  };

  return servers;
}

/** Pick Postgres MCP (supabase) or liq MCP (lidb) for Cursor SDK agents. */
export function buildControlPlaneMcpServers(): Record<string, McpServerConfig> | undefined {
  if (configuredStore() === "lidb") return buildControlPlaneLiqMcpServers();
  return buildControlPlaneDbMcpServers();
}
