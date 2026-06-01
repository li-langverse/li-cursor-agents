import { existsSync } from "node:fs";
import { join } from "node:path";
import { ensureLicPrebuild } from "../preflight/implementer-preflight-gate.js";
import { runCmd } from "../repo-workflow/git.js";
import { workerConsole } from "../worker/worker-console.js";
import {
  proofExplorerGoalFile,
  proofExplorerLicRoot,
  proofExplorerTrackedBranch,
} from "./proof-explorer-worker-config.js";

function licCompilerBin(licRoot: string): string {
  return join(licRoot, "build/compiler/lic/lic");
}

function branchCandidates(): string[] {
  const preferred = proofExplorerTrackedBranch();
  const raw = process.env.LI_PROOF_EXPLORER_BRANCH_FALLBACKS?.trim();
  const fallbacks = raw
    ? raw.split(",").map((s) => s.trim()).filter(Boolean)
    : ["main", "cursor/ph-ml-program-complete"];
  return [...new Set([preferred, ...fallbacks])];
}

/** Fetch origin and checkout the first branch that contains the sprint goal file. */
export function syncProofExplorerLicSmart(): { branch: string; ok: boolean; detail: string } {
  const licRoot = proofExplorerLicRoot();
  const goalRel = proofExplorerGoalFile();
  const fetch = runCmd("git", ["fetch", "origin", "--prune"], licRoot, false);
  if (!fetch.ok) {
    const msg = fetch.stderr || fetch.stdout || "git fetch failed";
    return { branch: proofExplorerTrackedBranch(), ok: false, detail: msg };
  }

  for (const branch of branchCandidates()) {
    const ref = runCmd(
      "git",
      ["show-ref", "--verify", "--quiet", `refs/remotes/origin/${branch}`],
      licRoot,
      false,
    );
    if (!ref.ok) continue;

    const checkout = runCmd(
      "git",
      ["checkout", "-f", "-B", branch, `origin/${branch}`],
      licRoot,
      false,
    );
    if (!checkout.ok) continue;

    runCmd("git", ["reset", "--hard", `origin/${branch}`], licRoot, false);
    if (!existsSync(join(licRoot, goalRel))) continue;

    process.env.LI_PROOF_EXPLORER_BRANCH = branch;
    process.env.LI_REPO_WORKFLOW_BRANCH = branch;
    const head = runCmd("git", ["log", "-1", "--oneline"], licRoot, false);
    const detail = head.ok ? head.stdout.trim() : branch;
    return { branch, ok: true, detail };
  }

  return {
    branch: proofExplorerTrackedBranch(),
    ok: false,
    detail: `no branch contains goal ${goalRel}`,
  };
}

export function syncBenchmarksRepo(): { ok: boolean; detail: string } {
  const root = process.env.BENCHMARKS_ROOT?.trim() || "/workspace/benchmarks";
  const org = process.env.LI_GITHUB_ORG?.trim() || "li-langverse";
  const repo = process.env.LI_BENCHMARKS_REPO?.trim() || "benchmarks";
  const branch = process.env.LI_BENCHMARKS_BRANCH?.trim() || "main";
  const token = process.env.GH_TOKEN?.trim() || process.env.GITHUB_TOKEN?.trim();

  if (!existsSync(join(root, ".git"))) {
    if (!token) {
      return { ok: false, detail: "benchmarks missing and no GH_TOKEN for clone" };
    }
    runCmd(
      "gh",
      ["repo", "clone", `${org}/${repo}`, root, "--", "--branch", branch],
      "/",
      false,
    );
  } else {
    runCmd("git", ["fetch", "origin", "--prune"], root, false);
    const ref = runCmd(
      "git",
      ["show-ref", "--verify", "--quiet", `refs/remotes/origin/${branch}`],
      root,
      false,
    );
    if (ref.ok) {
      runCmd("git", ["checkout", "-f", "-B", branch, `origin/${branch}`], root, false);
      runCmd("git", ["reset", "--hard", `origin/${branch}`], root, false);
    }
  }

  if (!existsSync(join(root, "harness/bench.py"))) {
    return { ok: false, detail: `missing harness at ${root}/harness/bench.py` };
  }
  return { ok: true, detail: root };
}

export function ensureProofExplorerLicBuilt(): { ok: boolean; detail: string } {
  const licRoot = proofExplorerLicRoot();
  const pre = ensureLicPrebuild(licRoot);
  if (pre.ok) {
    process.env.LIC = licCompilerBin(licRoot);
    process.env.LIC_ROOT = licRoot;
  }
  return pre;
}

/** Self-heal PVC workspace: sync lic+benchmarks, build lic if needed, export LIC=. */
export function healProofExplorerWorkspace(): void {
  const lic = syncProofExplorerLicSmart();
  if (lic.ok) {
    workerConsole(
      "li-proof-explorer",
      "info",
      `workspace heal: lic branch=${lic.branch} ${lic.detail}`,
    );
  } else {
    workerConsole("li-proof-explorer", "warn", `workspace heal: lic sync failed: ${lic.detail}`);
  }

  const bench = syncBenchmarksRepo();
  if (bench.ok) {
    workerConsole("li-proof-explorer", "info", `workspace heal: benchmarks OK ${bench.detail}`);
  } else {
    workerConsole("li-proof-explorer", "warn", `workspace heal: benchmarks: ${bench.detail}`);
  }

  const built = ensureProofExplorerLicBuilt();
  if (built.ok) {
    workerConsole("li-proof-explorer", "info", `workspace heal: ${built.detail} LIC=${process.env.LIC ?? ""}`);
  } else {
    workerConsole("li-proof-explorer", "warn", `workspace heal: lic build: ${built.detail}`);
  }
}
