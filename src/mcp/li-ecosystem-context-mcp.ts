#!/usr/bin/env node
/**
 * MCP: handoff placement + research session tools for plan/implement agents.
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { loadRuntimeEnv } from "../env.js";
import { join } from "node:path";
import { agentsPackageRoot } from "../runner.js";
import {
  describePackageFromBriefing,
  listOrgReposFromBriefing,
  loadBriefingJson,
  searchRepoTree,
} from "./ecosystem-briefing-tools.js";
import { listHandoffs } from "../handoffs/handoff-store.js";
import { applyPlacementDecision } from "../handoffs/placement-governance.js";
import type { HandoffStatus, PackagePlacement } from "../handoffs/types.js";
import {
  advanceResearchSession,
  loadResearchSession,
} from "../research-sessions/session-store.js";

loadRuntimeEnv();

const server = new Server(
  { name: "li-ecosystem-context", version: "0.1.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "list_pending_handoffs",
      description: "List agent handoffs filtered by status and target agent.",
      inputSchema: {
        type: "object",
        properties: {
          status: { type: "string" },
          to_agent: { type: "string" },
          limit: { type: "number" },
        },
        additionalProperties: false,
      },
    },
    {
      name: "record_placement_decision",
      description: "Set package_placement on a pending_placement handoff and move to pending.",
      inputSchema: {
        type: "object",
        properties: {
          handoff_id: { type: "string" },
          package_placement: { type: "object" },
        },
        required: ["handoff_id", "package_placement"],
        additionalProperties: false,
      },
    },
    {
      name: "load_research_session",
      description: "Load in_progress research session for an agent id.",
      inputSchema: {
        type: "object",
        properties: { agent_id: { type: "string" } },
        required: ["agent_id"],
        additionalProperties: false,
      },
    },
    {
      name: "get_briefing_snapshot",
      description: "Read compact keys from data/latest/agent-briefing.json (explorer, packages, scorecard).",
      inputSchema: {
        type: "object",
        properties: {
          benchmarks_root: { type: "string" },
        },
        additionalProperties: false,
      },
    },
    {
      name: "list_org_repos",
      description: "List org repo names from briefing ecosystem_explorer.repos or org_packages keys.",
      inputSchema: {
        type: "object",
        properties: {
          benchmarks_root: { type: "string" },
        },
        additionalProperties: false,
      },
    },
    {
      name: "search_repo_tree",
      description: "Read-only filename/content search under BENCHMARKS_ROOT/../repo or fixture explorer tree.",
      inputSchema: {
        type: "object",
        properties: {
          repo: { type: "string" },
          query: { type: "string" },
          max_results: { type: "number" },
          benchmarks_root: { type: "string" },
        },
        required: ["repo", "query"],
        additionalProperties: false,
      },
    },
    {
      name: "describe_package",
      description: "Return org_packages or lic_packages row for package_id from briefing JSON.",
      inputSchema: {
        type: "object",
        properties: {
          package_id: { type: "string" },
          benchmarks_root: { type: "string" },
        },
        required: ["package_id"],
        additionalProperties: false,
      },
    },
    {
      name: "advance_research_session",
      description: "Mark current focus complete and advance queue for agent.",
      inputSchema: {
        type: "object",
        properties: {
          agent_id: { type: "string" },
          step_summary: { type: "string" },
          artifact: { type: "string" },
        },
        required: ["agent_id", "step_summary"],
        additionalProperties: false,
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const name = req.params.name;
  const args = (req.params.arguments ?? {}) as Record<string, unknown>;

  try {
    if (name === "list_pending_handoffs") {
      const status =
        typeof args.status === "string" ? (args.status as HandoffStatus) : undefined;
      const rows = await listHandoffs({
        status,
        toAgent: typeof args.to_agent === "string" ? args.to_agent : undefined,
        limit: Number(args.limit ?? 20),
      });
      return { content: [{ type: "text", text: JSON.stringify(rows, null, 2) }] };
    }

    if (name === "get_briefing_snapshot") {
      const root =
        typeof args.benchmarks_root === "string"
          ? args.benchmarks_root
          : process.env.BENCHMARKS_ROOT ?? join(agentsPackageRoot(), "fixtures", "e2e-benchmarks");
      const full = loadBriefingJson(root);
      if (!full) {
        const path = join(root, "data", "latest", "agent-briefing.json");
        return { content: [{ type: "text", text: `missing ${path}` }], isError: true };
      }
      const compact = {
        generated_at: full.generated_at,
        recommended_agents: full.recommended_agents,
        ecosystem_explorer: full.ecosystem_explorer,
        swarm_scorecard: full.swarm_scorecard,
        research_goals_status: full.research_goals_status,
        handoff_audit: full.handoff_audit,
        org_packages: full.org_packages,
        lic_packages: full.lic_packages,
      };
      return { content: [{ type: "text", text: JSON.stringify(compact, null, 2) }] };
    }

    if (name === "list_org_repos") {
      const root = typeof args.benchmarks_root === "string" ? args.benchmarks_root : undefined;
      const briefing = loadBriefingJson(root);
      const repos = listOrgReposFromBriefing(briefing);
      return { content: [{ type: "text", text: JSON.stringify({ repos }, null, 2) }] };
    }

    if (name === "search_repo_tree") {
      const repo = String(args.repo);
      const query = String(args.query ?? "");
      const max = Number(args.max_results ?? 20);
      const root = typeof args.benchmarks_root === "string" ? args.benchmarks_root : undefined;
      const result = searchRepoTree(repo, query, max, root);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }

    if (name === "describe_package") {
      const root = typeof args.benchmarks_root === "string" ? args.benchmarks_root : undefined;
      const briefing = loadBriefingJson(root);
      const row = describePackageFromBriefing(briefing, String(args.package_id));
      if (!row) {
        return {
          content: [{ type: "text", text: `package not found: ${args.package_id}` }],
          isError: true,
        };
      }
      return { content: [{ type: "text", text: JSON.stringify(row, null, 2) }] };
    }

    if (name === "record_placement_decision") {
      const placement = args.package_placement as PackagePlacement;
      const handoffId = String(args.handoff_id);
      const pending = await listHandoffs({ status: "pending_placement", limit: 50 });
      const handoff = pending.find((h) => h.handoff_id === handoffId);
      const result = await applyPlacementDecision(handoffId, placement, handoff);
      if (!result.ok) {
        return {
          content: [{ type: "text", text: JSON.stringify({ errors: result.errors }, null, 2) }],
          isError: true,
        };
      }
      return { content: [{ type: "text", text: JSON.stringify(result.handoff, null, 2) }] };
    }

    if (name === "load_research_session") {
      const session = await loadResearchSession(String(args.agent_id));
      return { content: [{ type: "text", text: JSON.stringify(session, null, 2) }] };
    }

    if (name === "advance_research_session") {
      const agentId = String(args.agent_id);
      const session = await loadResearchSession(agentId);
      if (!session?.current_focus) {
        return { content: [{ type: "text", text: "no in_progress session or focus" }], isError: true };
      }
      const stepId = `${session.current_focus.kind}-${session.completed_steps.length + 1}`;
      const updated = await advanceResearchSession(agentId, {
        completed_step: {
          id: stepId,
          summary: String(args.step_summary),
          artifact: args.artifact as string | undefined,
        },
        dequeue: true,
      });
      return { content: [{ type: "text", text: JSON.stringify(updated, null, 2) }] };
    }

    return { content: [{ type: "text", text: `unknown tool: ${name}` }], isError: true };
  } catch (err) {
    return {
      content: [{ type: "text", text: err instanceof Error ? err.message : String(err) }],
      isError: true,
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
