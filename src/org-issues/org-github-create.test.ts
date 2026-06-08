import test from "node:test";
import assert from "node:assert/strict";
import {
  NOVEL_RESEARCH_ISSUE_LABELS,
  createGitHubIssueAsync,
  createGitHubRepoAsync,
} from "./org-github-create.js";

test("createGitHubIssueAsync dry_run validates required fields", async () => {
  const bad = await createGitHubIssueAsync({ repo: "", title: "t", body: "b" });
  assert.equal(bad.ok, false);

  const dry = await createGitHubIssueAsync({
    repo: "lic",
    title: "Add Kokkos backend",
    body: "Evidence…",
    dryRun: true,
  });
  assert.equal(dry.ok, true);
  assert.equal(dry.created, true);
  assert.equal(dry.dry_run, true);
  assert.deepEqual(dry.labels, [...NOVEL_RESEARCH_ISSUE_LABELS]);
});

test("createGitHubRepoAsync dry_run requires rationale", async () => {
  const bad = await createGitHubRepoAsync({
    name: "li-foo",
    description: "d",
    rationale: "",
    dryRun: true,
  });
  assert.equal(bad.ok, false);

  const dry = await createGitHubRepoAsync({
    name: "li-foo",
    description: "New package shell",
    rationale: "Isolated release cadence",
    dryRun: true,
  });
  assert.equal(dry.ok, true);
  assert.equal(dry.full_name, "li-langverse/li-foo");
});
