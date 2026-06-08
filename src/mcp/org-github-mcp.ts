#!/usr/bin/env node
/**
 * MCP tools for org GitHub: auditable close + gated create (issues/repos).
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
import {
  createGitHubIssueAsync,
  createGitHubRepoAsync,
} from "../org-issues/org-github-create.js";

loadRuntimeEnv();

const server = new Server(
  { name: "li-org-github", version: "0.2.0" },
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
    {
      name: "create_github_issue",
      description:
        "Create a li-langverse GitHub issue for novel research / gap findings. " +
        "Default labels: plan-needed, novel-research, ecosystem-gap (routes to planner lane).",
      inputSchema: {
        type: "object",
        properties: {
          repo: { type: "string", description: "Target repo under li-langverse" },
          title: { type: "string" },
          body: { type: "string", description: "Markdown body with evidence and proposed direction" },
          labels: {
            type: "array",
            items: { type: "string" },
            description: "Optional label override",
          },
          dry_run: { type: "boolean" },
        },
        required: ["repo", "title", "body"],
        additionalProperties: false,
      },
    },
    {
      name: "create_github_repo",
      description:
        "Create a new private repo in li-langverse when a gap needs an isolated package. " +
        "Requires rationale; follow with a planning issue in the new repo.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Repo name (no org prefix)" },
          description: { type: "string" },
          rationale: { type: "string", description: "Why a new repo is needed vs extending existing" },
          private: { type: "boolean", description: "Default true" },
          dry_run: { type: "boolean" },
        },
        required: ["name", "description", "rationale"],
        additionalProperties: false,
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const args = request.params.arguments ?? {};

  if (request.params.name === "close_github_issue") {
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
  }

  if (request.params.name === "create_github_issue") {
    const result = await createGitHubIssueAsync({
      repo: String(args.repo ?? ""),
      title: String(args.title ?? ""),
      body: String(args.body ?? ""),
      labels: Array.isArray(args.labels) ? args.labels.map(String) : undefined,
      dryRun: args.dry_run === true,
    });
    return {
      content: [{ type: "text", text: JSON.stringify(result) }],
      isError: !result.ok,
    };
  }

  if (request.params.name === "create_github_repo") {
    const result = await createGitHubRepoAsync({
      name: String(args.name ?? ""),
      description: String(args.description ?? ""),
      rationale: String(args.rationale ?? ""),
      private: args.private !== false,
      dryRun: args.dry_run === true,
    });
    return {
      content: [{ type: "text", text: JSON.stringify(result) }],
      isError: !result.ok,
    };
  }

  return {
    content: [{ type: "text", text: `Unknown tool: ${request.params.name}` }],
    isError: true,
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
