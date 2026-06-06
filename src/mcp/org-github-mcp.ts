#!/usr/bin/env node
/**
 * MCP tools for org-issue-zero: auditable GitHub issue close (no shell scripts in agent chat).
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { loadRuntimeEnv } from "../env.js";
import {
  ORG_ISSUE_CLOSE_REASONS,
  closeOrgIssue,
  isOrgIssueCloseReason,
} from "../org-issues/org-close-issue.js";

loadRuntimeEnv();

const server = new Server(
  { name: "li-org-github", version: "0.1.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "close_github_issue",
      description:
        "Close one li-langverse GitHub issue with mandatory audit comment. " +
        "Use when triage decision is duplicate, already implemented, spam, wontfix, superseded, etc. " +
        "Returns closed:true only when GitHub state is closed (or dry_run).",
      inputSchema: {
        type: "object",
        properties: {
          repo: { type: "string", description: "Repository name, e.g. lic, li-cursor-agents" },
          number: { type: "number", description: "Issue number" },
          reason: {
            type: "string",
            enum: [...ORG_ISSUE_CLOSE_REASONS],
            description: "Close reason code",
          },
          summary: { type: "string", description: "One-line summary of why this closes" },
          evidence: {
            type: "string",
            description: "Proof: PR link, file on main, duplicate of #N, etc.",
          },
          dry_run: { type: "boolean", description: "Preview only; default false" },
        },
        required: ["repo", "number", "reason", "summary", "evidence"],
        additionalProperties: false,
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name !== "close_github_issue") {
    return {
      content: [{ type: "text", text: `Unknown tool: ${request.params.name}` }],
      isError: true,
    };
  }

  const args = request.params.arguments ?? {};
  const repo = String(args.repo ?? "").trim();
  const number = Number(args.number);
  const reasonRaw = String(args.reason ?? "").trim();
  const summary = String(args.summary ?? "").trim();
  const evidence = String(args.evidence ?? "").trim();
  const dryRun = args.dry_run === true;

  if (!isOrgIssueCloseReason(reasonRaw)) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            ok: false,
            closed: false,
            error: `invalid reason; use one of: ${ORG_ISSUE_CLOSE_REASONS.join(", ")}`,
          }),
        },
      ],
      isError: true,
    };
  }

  const result = closeOrgIssue({
    repo,
    number,
    reason: reasonRaw,
    summary,
    evidence,
    dryRun,
  });

  return {
    content: [{ type: "text", text: JSON.stringify(result) }],
    isError: !result.ok,
  };
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
