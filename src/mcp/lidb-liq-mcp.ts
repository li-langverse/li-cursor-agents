#!/usr/bin/env node
/**
 * MCP stdio server: read-only control-plane exploration via **liq** (PH-DB-2 / PH-DB-10).
 *
 * Tools: schema_snapshot, describe_table_liq, query_control_plane_liq
 *
 * Mock rows until `LI_CONTROL_PLANE_STORE=lidb` and lidb engine accept liorm plans.
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { loadRuntimeEnv } from "../env.js";
import { describeTableLiq, runLiqQuery, schemaSnapshot } from "../db/liq-query.js";

loadRuntimeEnv();

const server = new Server(
  { name: "li-control-plane-liq", version: "0.1.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "schema_snapshot",
      description:
        "Control-plane catalog snapshot (tables, purposes, key columns). Prefer over raw SQL when store=lidb.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
    },
    {
      name: "describe_table_liq",
      description: "Describe allowlisted control-plane table columns (catalog / mock until lidb).",
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
      name: "query_control_plane_liq",
      description:
        'Run read-only liq (e.g. "read agent_runs limit 20"). Compiles to parameterized plans when lidb is wired.',
      inputSchema: {
        type: "object",
        properties: {
          liq: { type: "string", description: 'liq read query, e.g. read agent_runs limit 20' },
        },
        required: ["liq"],
        additionalProperties: false,
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const name = req.params.name;
  const args = (req.params.arguments ?? {}) as Record<string, unknown>;

  if (name === "schema_snapshot") {
    return {
      content: [{ type: "text", text: JSON.stringify(schemaSnapshot(), null, 2) }],
    };
  }

  if (name === "describe_table_liq") {
    const table = String(args.table ?? "");
    const result = await describeTableLiq(table);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      isError: !result.ok,
    };
  }

  if (name === "query_control_plane_liq") {
    const liq = String(args.liq ?? "");
    const result = await runLiqQuery(liq);
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
