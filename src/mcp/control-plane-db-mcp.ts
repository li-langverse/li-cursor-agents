#!/usr/bin/env node
/**
 * MCP stdio server: read-only exploration of the local control-plane Postgres (Supabase).
 *
 * Tools: list_control_plane_tables, describe_table, query_control_plane_db
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { loadRuntimeEnv } from "../env.js";
import { CONTROL_PLANE_TABLES, schemaMarkdown } from "../db/schema-catalog.js";
import { describeTable, runReadOnlyQuery } from "../db/read-query.js";

loadRuntimeEnv();
const agentsRoot = process.env.LI_CURSOR_AGENTS_ROOT ?? join(process.cwd());
const supabaseEnv = join(agentsRoot, ".env.supabase");
if (existsSync(supabaseEnv)) {
  for (const line of readFileSync(supabaseEnv, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 1) continue;
    const key = t.slice(0, eq).trim();
    const val = t.slice(eq + 1).trim();
    if (!(key in process.env) || process.env[key] === "") process.env[key] = val;
  }
}
if (!process.env.SUPABASE_DB_URL?.trim()) {
  process.env.SUPABASE_DB_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
}

const server = new Server(
  { name: "li-control-plane-db", version: "0.1.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "list_control_plane_tables",
      description: "List control-plane tables with purpose and key columns.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
    },
    {
      name: "describe_table",
      description: "Describe columns for one control-plane table (information_schema).",
      inputSchema: {
        type: "object",
        properties: {
          table: { type: "string", description: "Table name, e.g. agent_runs" },
        },
        required: ["table"],
        additionalProperties: false,
      },
    },
    {
      name: "query_control_plane_db",
      description:
        "Run a read-only SQL query (SELECT/WITH/EXPLAIN only) against public control-plane tables. Max 200 rows.",
      inputSchema: {
        type: "object",
        properties: {
          sql: { type: "string", description: "Read-only SQL" },
          max_rows: { type: "number", description: "Optional row cap (default 200)" },
        },
        required: ["sql"],
        additionalProperties: false,
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const name = req.params.name;
  const args = (req.params.arguments ?? {}) as Record<string, unknown>;

  if (name === "list_control_plane_tables") {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ tables: CONTROL_PLANE_TABLES, markdown: schemaMarkdown() }, null, 2),
        },
      ],
    };
  }

  if (name === "describe_table") {
    const table = String(args.table ?? "");
    const result = await describeTable(table);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      isError: !result.ok,
    };
  }

  if (name === "query_control_plane_db") {
    const sql = String(args.sql ?? "");
    const maxRows = args.max_rows != null ? Number(args.max_rows) : undefined;
    const result = await runReadOnlyQuery(sql, { maxRows });
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      isError: !result.ok,
    };
  }

  return {
    content: [{ type: "text", text: `unknown tool: ${name}` }],
    isError: true,
  };
});

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
