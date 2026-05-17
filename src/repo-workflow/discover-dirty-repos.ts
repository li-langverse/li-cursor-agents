import { existsSync, readFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { runCmd, gitStatusPorcelain } from "./git.js";

export interface DirtyRepoDiscovery {
  path: string;
  repo: string;
  org: string;
  branch: string;
  default_branch: string;
  porcelain: string;
  changed_files: number;
  test_commands: string[];
  remote_url?: string;
}

const SECRET_PATH =
  /(?:^|\/)(?:\.env(?:\.|$)|\.env\.github|credentials\.json|\.pem$|id_rsa$|\.supabase\/|node_modules\/)/i;

export function resolveSweepRoots(benchmarksRoot?: string): string[] {
  const fromEnv = process.env.LI_WORKSPACE_SWEEP_ROOTS?.trim();
  if (fromEnv) {
    return fromEnv
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p) => resolve(p));
  }
  const anchor = benchmarksRoot?.trim()
    ? resolve(benchmarksRoot, "..")
    : resolve(process.cwd(), "..");
  const names = (
    process.env.LI_WORKSPACE_SWEEP_REPO_NAMES ??
    "lic,benchmarks,roadmap,li-cursor-agents,li"
  )
    .split(",")
    .map((n) => n.trim())
    .filter(Boolean);
  const roots = names.map((n) => join(anchor, n)).filter((p) => existsSync(join(p, ".git")));
  if (roots.length > 0) return roots;
  return [resolve(process.cwd())];
}

export function inferTestCommands(repoPath: string): string[] {
  const cmds: string[] = [];
  const pkgPath = join(repoPath, "package.json");
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { scripts?: Record<string, string> };
      if (pkg.scripts?.test && !/no test specified/i.test(pkg.scripts.test)) {
        cmds.push("npm test");
      }
      if (pkg.scripts?.["test:quick"]) cmds.push("npm run test:quick");
    } catch {
      /* ignore */
    }
  }
  if (existsSync(join(repoPath, "li-tests", "run_all.sh"))) {
    cmds.push("./li-tests/run_all.sh");
  }
  if (existsSync(join(repoPath, "Makefile"))) {
    cmds.push("make test");
  }
  return [...new Set(cmds)];
}

function remoteRepoSlug(repoPath: string): { org: string; repo: string; url?: string } | null {
  const r = runCmd("git", ["remote", "get-url", "origin"], repoPath, false);
  if (!r.ok || !r.stdout) return null;
  const url = r.stdout.trim();
  const m =
    /github\.com[:/]([^/]+)\/([^/.]+)(?:\.git)?$/i.exec(url) ??
    /github\.com[:/]([^/]+)\/([^/]+?)(?:\.git)?$/i.exec(url);
  if (!m) return null;
  return { org: m[1], repo: m[2].replace(/\.git$/, ""), url };
}

function currentBranch(repoPath: string): string {
  const r = runCmd("git", ["branch", "--show-current"], repoPath, false);
  return r.ok && r.stdout ? r.stdout.trim() : "HEAD";
}

export function discoverDirtyRepos(roots?: string[]): DirtyRepoDiscovery[] {
  const scanRoots = roots ?? resolveSweepRoots();
  const out: DirtyRepoDiscovery[] = [];
  const seen = new Set<string>();

  for (const root of scanRoots) {
    if (!existsSync(join(root, ".git"))) continue;
    const resolved = resolve(root);
    if (seen.has(resolved)) continue;
    seen.add(resolved);

    const porcelain = gitStatusPorcelain(resolved, false).trim();
    if (!porcelain) continue;

    const files = porcelain
      .split("\n")
      .map((l) => l.slice(3).trim())
      .filter((p) => p && !SECRET_PATH.test(p));
    if (files.length === 0) continue;

    const remote = remoteRepoSlug(resolved);
    const org = remote?.org ?? process.env.GH_ORG ?? "li-langverse";
    const repo = remote?.repo ?? basename(resolved);
    const branch = currentBranch(resolved);
    const defRef = runCmd("git", ["rev-parse", "--abbrev-ref", "origin/HEAD"], resolved, false);
    const defaultBranch =
      defRef.ok && defRef.stdout ? defRef.stdout.replace(/^origin\//, "") : "main";

    out.push({
      path: resolved,
      repo,
      org,
      branch,
      default_branch: defaultBranch || "main",
      porcelain,
      changed_files: files.length,
      test_commands: inferTestCommands(resolved),
      remote_url: remote?.url,
    });
  }

  return out.sort((a, b) => b.changed_files - a.changed_files);
}

export function safeChangedPaths(porcelain: string): string[] {
  return porcelain
    .split("\n")
    .map((l) => l.slice(3).trim())
    .filter((p) => p && !SECRET_PATH.test(p));
}
