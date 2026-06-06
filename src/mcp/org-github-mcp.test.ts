import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import test from "node:test";
import { agentsPackageRoot } from "../runner.js";
import { closeOrgIssue } from "../org-issues/org-close-issue.js";
import {
  ORG_GITHUB_MCP_ID,
  buildOrgGithubMcpServer,
  orgGithubMcpEntryPath,
} from "./mcp-config.js";

test("org github MCP entry exists after build", () => {
  const path = orgGithubMcpEntryPath();
  assert.equal(existsSync(path), true, path);
});

test("buildOrgGithubMcpServer uses stdio node entry", () => {
  const cfg = buildOrgGithubMcpServer();
  assert.equal(cfg.type, "stdio");
  assert.equal(cfg.command, process.execPath);
  assert.ok(cfg.args?.[0]?.endsWith("org-github-mcp.js"));
  assert.equal(cfg.env?.LI_CURSOR_AGENTS_ROOT, agentsPackageRoot());
});

test("ORG_GITHUB_MCP_ID is li-org-github", () => {
  assert.equal(ORG_GITHUB_MCP_ID, "li-org-github");
});

test("closeOrgIssue dry_run validates input without GitHub", () => {
  const bad = closeOrgIssue({
    repo: "",
    number: 0,
    reason: "duplicate",
    summary: "x",
    evidence: "y",
  });
  assert.equal(bad.ok, false);
  assert.equal(bad.closed, false);

  const dry = closeOrgIssue({
    repo: "lic",
    number: 394,
    reason: "already_implemented",
    summary: "capture script on main",
    evidence: "scripts/studio-ui-ux-capture-native.sh exists",
    dryRun: true,
  });
  assert.equal(dry.ok, true);
  assert.equal(dry.closed, true);
  assert.match(dry.message, /dry-run|would close|394/i);
});
