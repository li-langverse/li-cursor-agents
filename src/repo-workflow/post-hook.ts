import { appendFileSync } from "node:fs";
import type { AgentDefinition } from "../types.js";
import type { AgentRunResult } from "../types.js";
import { commitPushOpenPr, pushUnpublishedCommits } from "./pr.js";
import type { CommitPushPrResult } from "./types.js";
import {
  defaultPrBody,
  type RepoWorkflowSession,
  workspaceHasChanges,
} from "./workspace-session.js";

export interface PostHookPushResult extends CommitPushPrResult {
  workspace: string;
  repo: string;
}

const IMPLEMENT_RHYTHM_AGENTS = new Set(["code_implementer", "bug_fixer"]);

/** Implement agents commit+push each run; open PR unless explicitly disabled. */
export function shouldOpenPrAfterRun(agentId: string): boolean {
  if (!IMPLEMENT_RHYTHM_AGENTS.has(agentId)) return true;
  const v = process.env.LI_REPO_WORKFLOW_OPEN_PR?.trim().toLowerCase();
  if (v === "0" || v === "false" || v === "off" || v === "no") return false;
  return true;
}

export function formatPushDigest(push: PostHookPushResult): string {
  const lines = ["", "## Repo workflow push (post-hook)", ""];
  if (push.pr_url) lines.push(`- **PR:** ${push.pr_url}`);
  if (push.pushed) lines.push(`- **Pushed:** \`${push.branch}\` → origin`);
  if (push.committed && !push.pushed) lines.push(`- **Committed locally** (push skipped)`);
  if (push.skipped) lines.push(`- **Skipped:** ${push.skip_reason ?? "no changes"}`);
  if (push.error) lines.push(`- **Error:** ${push.error}`);
  return lines.join("\n");
}

/** After agent run: commit, push, and open PR when workspace has uncommitted work. */
export function commitPushOpenPrAfterAgentRun(
  session: RepoWorkflowSession,
  definition: AgentDefinition,
  result: AgentRunResult,
): PostHookPushResult {
  const dryRun = session.dryRun;
  const skipPush = session.skipPush || process.env.LI_REPO_WORKFLOW_SKIP_PUSH === "1";

  if (!session.ok) {
    return {
      ok: false,
      workspace: session.cloneDir,
      repo: session.repo,
      committed: false,
      pushed: false,
      branch: session.branch,
      error: session.error ?? "workspace not ready",
    };
  }

  if (!workspaceHasChanges(session)) {
    if (!skipPush) {
      const ahead = pushUnpublishedCommits(session.cloneDir, session.branch, dryRun, skipPush);
      if (ahead.pushed) {
        return {
          ok: true,
          workspace: session.cloneDir,
          repo: session.repo,
          committed: false,
          pushed: true,
          branch: session.branch,
          skip_reason: "pushed unpublished commits (clean working tree)",
        };
      }
      if (ahead.error) {
        return {
          ok: false,
          workspace: session.cloneDir,
          repo: session.repo,
          committed: false,
          pushed: false,
          branch: session.branch,
          error: ahead.error,
        };
      }
    }
    return {
      ok: true,
      skipped: true,
      skip_reason: "no uncommitted changes in workspace",
      workspace: session.cloneDir,
      repo: session.repo,
      committed: false,
      pushed: false,
      branch: session.branch,
    };
  }

  const title =
    process.env.LI_REPO_WORKFLOW_PR_TITLE?.trim() ??
    `chore(${session.repo}): ${definition.name} automated update`;
  const body =
    process.env.LI_REPO_WORKFLOW_PR_BODY?.trim() ??
    defaultPrBody(definition.id, result.reason);

  let push = commitPushOpenPr(session.cloneDir, {
    branch: session.branch,
    baseBranch: session.baseBranch,
    org: session.org,
    repo: session.repo,
    commitMessage: `chore(${session.repo}): ${definition.id} post-hook commit`,
    prTitle: title,
    prBody: body,
    dryRun,
    skipPush,
    openPr: shouldOpenPrAfterRun(definition.id),
  });

  if (!skipPush && !push.pushed) {
    const extra = pushUnpublishedCommits(session.cloneDir, session.branch, dryRun, skipPush);
    if (extra.pushed) {
      push = { ...push, ok: true, pushed: true, skipped: false, skip_reason: undefined };
    } else if (extra.error && !push.error) {
      push = { ...push, error: extra.error };
    }
  }

  return {
    ...push,
    workspace: session.cloneDir,
    repo: session.repo,
  };
}

export function applyPostHookToRunResult(
  result: AgentRunResult,
  push: PostHookPushResult,
): AgentRunResult {
  const digest = formatPushDigest(push);
  const outputText = (result.outputText ?? "") + digest;
  const pr_urls = [...new Set([...(result.completion?.pr_urls ?? []), ...(push.pr_url ? [push.pr_url] : [])])];

  if (result.outputPath.endsWith(".md")) {
    try {
      appendFileSync(result.outputPath, digest, "utf8");
    } catch {
      /* optional */
    }
  }

  return {
    ...result,
    outputText,
    completion: result.completion
      ? {
          ...result.completion,
          pr_urls,
          evidence: [
            ...result.completion.evidence,
            ...(push.pushed ? ["post_hook_pushed"] : []),
            ...(push.committed ? ["post_hook_committed"] : []),
          ],
        }
      : result.completion,
  };
}
