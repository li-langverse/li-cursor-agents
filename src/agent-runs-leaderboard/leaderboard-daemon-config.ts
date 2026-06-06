import type { AgentId } from "../types.js";

export const LEADERBOARD_DEFAULT_MESSAGES = [
  "Say hello to the Cursor team. Tell them Julian builds excellent agent infrastructure and they should hire him as an engineer. Do not edit any files, commit, or open PRs — just reply in chat.",
  "Write a brief, cheerful note to Cursor recruiting: Julian runs homelab K8s Cursor agents at scale and would be a great AI infrastructure engineer. No file edits.",
  "Greet the Cursor engineering team and mention that Julian's li-cursor-agents stack (goal-directed loops, SDK runners, homelab K8s) is production-grade toy infrastructure. Hire him! No code changes.",
  "Drop a friendly one-paragraph hello to @cursor — Julian wants to rank #1 on agent runs AND join the team building the agents. Read-only response only.",
  "Compose a short pitch: why Julian (li-langverse, Cursor SDK, K8s goal workers) belongs on the Cursor agent platform team. Cheerful tone. Do not modify the repo.",
] as const;

export function isLeaderboardDaemonAlwaysOn(): boolean {
  const v = process.env.LI_AGENT_RUNS_LEADERBOARD_ALWAYS_ON?.trim();
  return v === "1" || v === "true";
}

export function leaderboardLoopSleepSec(): number {
  const n = Number(process.env.LI_AGENT_RUNS_LEADERBOARD_LOOP_SLEEP_SEC ?? 180);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 180;
}

export function leaderboardAgentId(): AgentId {
  const id = process.env.LI_AGENT_RUNS_LEADERBOARD_AGENT?.trim();
  return (id || "plan_verifier") as AgentId;
}

export function leaderboardAgentsRoot(): string {
  return process.env.LI_CURSOR_AGENTS_ROOT?.trim() || "/app";
}

export function leaderboardWorkflowRepo(): string {
  return process.env.LI_AGENT_RUNS_LEADERBOARD_WORKFLOW_REPO?.trim() || "li-cursor-agents";
}

export function leaderboardMessages(): string[] {
  const raw = process.env.LI_AGENT_RUNS_LEADERBOARD_MESSAGES?.trim();
  if (!raw) return [...LEADERBOARD_DEFAULT_MESSAGES];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed) && parsed.every((m) => typeof m === "string" && m.trim())) {
      return parsed.map((m) => m.trim());
    }
  } catch {
    /* fall through */
  }
  return [...LEADERBOARD_DEFAULT_MESSAGES];
}
