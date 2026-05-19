import { taskFingerprint } from "../heap/task-queue.js";
import { orgNewReposDiscoveryFromBriefing } from "../org-repos/discovery.js";
import type { AgentWorkQueueItem } from "./agent-work-queue.js";

function ciIsGreen(ci: unknown): boolean {
  const s = String(ci ?? "").toLowerCase();
  return s === "pass" || s === "success" || s === "green" || s === "ok";
}

function pushItem(
  items: AgentWorkQueueItem[],
  seen: Set<string>,
  item: AgentWorkQueueItem,
): void {
  if (seen.has(item.id)) return;
  seen.add(item.id);
  items.push(item);
}

/** Open PRs, merge queue, CI bugs, and org security sweeps from briefing JSON. */
export function pushBriefingDerivedWorkItems(
  items: AgentWorkQueueItem[],
  seen: Set<string>,
  briefing: unknown,
): void {
  if (!briefing || typeof briefing !== "object") return;
  const b = briefing as Record<string, unknown>;

  pushPrProgramWork(items, seen, b);
  pushMergePlanWork(items, seen, b);
  pushCiBugTriageWork(items, seen, b);
  pushSecurityOrgWork(items, seen, b);
  pushEcosystemMaintainerWork(items, seen, b);
  pushOrgRepoOnboardingWork(items, seen, b);
}

function pushOrgRepoOnboardingWork(
  items: AgentWorkQueueItem[],
  seen: Set<string>,
  b: Record<string, unknown>,
): void {
  const discovery = orgNewReposDiscoveryFromBriefing(b);
  if (!discovery?.new_repos?.length) return;

  pushItem(items, seen, {
    id: "org:onboard:discovery",
    agent_id: "org_repo_onboarder",
    source: "recommended",
    priority: 88,
    reason: `Onboard ${discovery.new_repos.length} new org repo(s): ${discovery.new_repos.slice(0, 4).join(", ")}${discovery.new_repos.length > 4 ? ", …" : ""}`,
    status: "pending",
    meta: { repos: discovery.new_repos.join(",") },
  });

  const entries = discovery.new_repo_entries ?? [];
  for (const entry of entries) {
    for (const step of entry.onboarding_steps) {
      pushItem(items, seen, {
        id: `org:onboard:${entry.repo}:${step.agent}:${step.action}`,
        agent_id: step.agent,
        source: "recommended",
        priority: step.agent === "package_architect" ? 72 : 56,
        reason: step.reason,
        status: "pending",
        meta: { repo: entry.repo, action: step.action, classification: entry.classification },
      });
    }
  }
}

function pushPrProgramWork(items: AgentWorkQueueItem[], seen: Set<string>, b: Record<string, unknown>): void {
  const pr = b.pr_program as Record<string, unknown> | undefined;
  const rows = (pr?.all_open ?? []) as Array<Record<string, unknown>>;
  for (const row of rows.slice(0, 16)) {
    const repo = String(row.repo ?? "");
    const num = Number(row.number ?? 0);
    if (!repo || !num) continue;
    const title = String(row.title ?? `PR #${num}`);
    const ci = row.ci;
    const url = String(row.url ?? "");
    const mergeApproved = Boolean(row.merge_approved);
    const gateReady = Boolean(row.gate_ready_with_approval);

    pushItem(items, seen, {
      id: `pr:align:${repo}:${num}`,
      agent_id: "pr_alignment",
      source: "recommended",
      priority: 68,
      reason: `Align open PR ${repo}#${num}: ${title.slice(0, 100)}`,
      status: "pending",
      meta: { repo, pr: num, url, ci: String(ci ?? "") },
    });

    pushItem(items, seen, {
      id: `pr:review:${repo}:${num}`,
      agent_id: "pr_reviewer",
      source: "recommended",
      priority: ciIsGreen(ci) ? 85 : 76,
      reason: ciIsGreen(ci)
        ? `Standards review (CI green) ${repo}#${num}: ${title.slice(0, 90)}`
        : `Standards review ${repo}#${num} (ci=${ci}): ${title.slice(0, 80)}`,
      status: "pending",
      meta: { repo, pr: num, url },
    });

    if (mergeApproved && gateReady) {
      pushItem(items, seen, {
        id: `pr:merge:${repo}:${num}`,
        agent_id: "pr_merger",
        source: "recommended",
        priority: 92,
        reason: `Merge gate-ready ${repo}#${num}: ${title.slice(0, 90)}`,
        status: "pending",
        meta: { repo, pr: num, url },
      });
    }
  }

  const hygiene = b.pr_branch_hygiene as Record<string, unknown> | undefined;
  const branches = (hygiene?.branches_without_pr ?? hygiene?.missing_prs ?? []) as unknown[];
  if (Array.isArray(branches)) {
    for (const raw of branches.slice(0, 6)) {
      const row = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
      const repo = String(row.repo ?? row.name ?? "lic");
      const branch = String(row.branch ?? row.ref ?? "unknown");
      pushItem(items, seen, {
        id: `pr:open:${repo}:${taskFingerprint("pr_branch_opener", branch)}`,
        agent_id: "pr_branch_opener",
        source: "recommended",
        priority: 74,
        reason: `Open PR for pushed branch ${repo}:${branch}`,
        status: "pending",
        meta: { repo, branch },
      });
    }
  }
}

function pushMergePlanWork(items: AgentWorkQueueItem[], seen: Set<string>, b: Record<string, unknown>): void {
  const plan = b.merge_plan as Record<string, unknown> | undefined;
  const sequence = (plan?.merge_sequence ?? plan?.merge_order ?? []) as Array<Record<string, unknown>>;
  for (const row of sequence.slice(0, 4)) {
    if (!row.merge_approved || !row.gate_ready) continue;
    const repo = String(row.repo ?? "");
    const num = Number(row.number ?? 0);
    if (!repo || !num) continue;
    pushItem(items, seen, {
      id: `merge_plan:${repo}:${num}`,
      agent_id: "pr_merger",
      source: "recommended",
      priority: 94,
      reason: `Merge sequence ${repo}#${num} (merge_plan)`,
      status: "pending",
      meta: { repo, pr: num },
    });
  }
}

function pushCiBugTriageWork(items: AgentWorkQueueItem[], seen: Set<string>, b: Record<string, unknown>): void {
  const triage = b.ci_bug_triage as Record<string, unknown> | undefined;
  const queue = triage?.work_queue;
  if (!Array.isArray(queue)) return;
  for (let i = 0; i < Math.min(queue.length, 10); i++) {
    const row = queue[i] as Record<string, unknown>;
    if (!row || typeof row !== "object") continue;
    const repo = String(row.repo ?? "lic");
    const num = row.number != null ? Number(row.number) : undefined;
    const reason = String(row.reason ?? row.title ?? row.kind ?? "CI/bug triage item");
    pushItem(items, seen, {
      id: `cibug:${repo}:${num ?? i}:${taskFingerprint("bug_fixer", reason)}`,
      agent_id: "bug_fixer",
      source: "implementation",
      priority: 78,
      reason: `Fix ${repo}${num ? `#${num}` : ""}: ${reason.slice(0, 100)}`,
      status: "pending",
      meta: { repo, pr: num, url: row.url ? String(row.url) : undefined },
    });
  }
}

function collectOrgRepos(b: Record<string, unknown>): string[] {
  const repos = new Set<string>();
  const orgCi = b.org_ci_audit as Record<string, unknown> | undefined;
  for (const r of (orgCi?.repos_ok ?? []) as unknown[]) {
    if (typeof r === "string" && r) repos.add(r);
  }
  for (const row of (orgCi?.repos_missing_ci ?? []) as Array<Record<string, unknown>>) {
    const name = row?.repo;
    if (typeof name === "string" && name) repos.add(name);
  }
  const kit = b.org_agent_kit_audit as Record<string, unknown> | undefined;
  for (const row of (kit?.repos_needing_sync ?? []) as Array<Record<string, unknown>>) {
    const name = typeof row === "string" ? row : String(row?.repo ?? "");
    if (name) repos.add(name);
  }
  const eco = b.ecosystem_audit as Record<string, unknown> | undefined;
  for (const r of (eco?.repos_without_live_docs ?? []) as unknown[]) {
    if (typeof r === "string" && r) repos.add(r);
  }
  for (const r of (eco?.missing_ci_on_main ?? []) as unknown[]) {
    if (typeof r === "string" && r) repos.add(r);
  }
  return [...repos].sort();
}

function pushSecurityOrgWork(items: AgentWorkQueueItem[], seen: Set<string>, b: Record<string, unknown>): void {
  const sec = b.security_cwe_audit as Record<string, unknown> | undefined;
  const gaps = Array.isArray(sec?.catalog_gaps) ? sec.catalog_gaps : [];
  if (gaps.length) {
    for (const g of gaps.slice(0, 6)) {
      if (!g || typeof g !== "object") continue;
      const row = g as Record<string, unknown>;
      const cwe = String(row.cwe ?? row.id ?? "?");
      const reason = String(row.reason ?? "CWE catalog gap");
      pushItem(items, seen, {
        id: `cwe:${cwe}:${taskFingerprint("security_auditor", reason)}`,
        agent_id: "security_auditor",
        source: "implementation",
        priority: 86,
        reason: `CWE ${cwe}: ${reason.slice(0, 100)}`,
        status: "pending",
        meta: { cwe },
      });
    }
  }

  const orgRepos = collectOrgRepos(b);
  if (orgRepos.length) {
    pushItem(items, seen, {
      id: "security:org:sweep",
      agent_id: "security_auditor",
      source: "recommended",
      priority: 66,
      reason: `CVE/CWE sweep across ${orgRepos.length} li-langverse repos (${orgRepos.slice(0, 5).join(", ")}${orgRepos.length > 5 ? ", …" : ""})`,
      status: "pending",
      meta: { repos: orgRepos.join(",") },
    });
    for (const repo of orgRepos.slice(0, 8)) {
      pushItem(items, seen, {
        id: `security:repo:${repo}`,
        agent_id: "security_auditor",
        source: "recommended",
        priority: 64,
        reason: `Org security audit: ${repo} (CVE catalog + workflows)`,
        status: "pending",
        meta: { repo },
      });
    }
  } else if (!gaps.length) {
    pushItem(items, seen, {
      id: "security:org:run-audit",
      agent_id: "security_auditor",
      source: "recommended",
      priority: 58,
      reason:
        "Run security-cwe-audit.py (preflight skipped) — map CWE gaps across li-langverse org repos",
      status: "pending",
    });
  }
}

function pushEcosystemMaintainerWork(
  items: AgentWorkQueueItem[],
  seen: Set<string>,
  b: Record<string, unknown>,
): void {
  const kit = b.org_agent_kit_audit as Record<string, unknown> | undefined;
  const kitSync = Array.isArray(kit?.repos_needing_sync) ? kit.repos_needing_sync : [];
  for (const raw of kitSync.slice(0, 8) as unknown[]) {
    const repo = typeof raw === "string" ? raw : String((raw as Record<string, unknown>)?.repo ?? "");
    if (!repo) continue;
    const status = typeof raw === "object" ? String((raw as Record<string, unknown>).status ?? "drift") : "drift";
    pushItem(items, seen, {
      id: `agentkit:${repo}`,
      agent_id: "agent_kit_maintainer",
      source: "recommended",
      priority: 52,
      reason: `Sync agent-kit on ${repo} (${status})`,
      status: "pending",
      meta: { repo },
    });
  }

  const orgCi = b.org_ci_audit as Record<string, unknown> | undefined;
  const missingCi = Array.isArray(orgCi?.repos_missing_ci) ? orgCi.repos_missing_ci : [];
  for (const row of missingCi.slice(0, 4) as Array<Record<string, unknown>>) {
    const repo = String(row.repo ?? "");
    if (!repo) continue;
    pushItem(items, seen, {
      id: `orgci:${repo}`,
      agent_id: "ci_maintainer",
      source: "recommended",
      priority: 54,
      reason: `Add ci.yml on ${repo} (org CI audit)`,
      status: "pending",
      meta: { repo },
    });
  }
}
