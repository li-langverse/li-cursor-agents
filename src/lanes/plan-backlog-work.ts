import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { resolveLangverseRoot } from "../implement-goals/lic-root.js";
import type { AgentId } from "../types.js";

export interface PlanBacklogTodo {
  id: string;
  content: string;
  status: string;
}

const PLAN_BACKLOG_BY_AGENT: Partial<Record<AgentId, { licSubpath: string; goalId: string }>> = {
  swarm_observer: {
    licSubpath: "lic/docs/ecosystem/swarm-observer-plan-backlog.md",
    goalId: "swarm_coverage",
  },
};

const TODO_BLOCK_RE =
  /- id: (\S+)\n\s+content: "([^"]+)"\n\s+status: (\w+)/g;

export function parsePlanBacklogTodos(markdown: string): PlanBacklogTodo[] {
  const todos: PlanBacklogTodo[] = [];
  for (const m of markdown.matchAll(TODO_BLOCK_RE)) {
    todos.push({ id: m[1]!, content: m[2]!, status: m[3]! });
  }
  return todos;
}

export function loadPlanBacklogTodos(agentId: AgentId): PlanBacklogTodo[] {
  const spec = PLAN_BACKLOG_BY_AGENT[agentId];
  if (!spec) return [];
  const langverse = resolveLangverseRoot();
  if (!langverse) return [];
  const path = join(langverse, spec.licSubpath);
  if (!existsSync(path)) return [];
  return parsePlanBacklogTodos(readFileSync(path, "utf8"));
}

export function pickNextPlanBacklogTodo(agentId: AgentId): PlanBacklogTodo | null {
  return (
    loadPlanBacklogTodos(agentId).find((t) => t.status === "pending" || t.status === "in_progress") ??
    null
  );
}

export function buildPlanBacklogInstruction(agentId: AgentId, todo: PlanBacklogTodo): string {
  const spec = PLAN_BACKLOG_BY_AGENT[agentId];
  const goalId = spec?.goalId ?? "swarm_coverage";
  const day = new Date().toISOString().slice(0, 10);
  const noteRel =
    agentId === "swarm_observer"
      ? `lic/docs/ecosystem/orchestrator-notes/${day}-${todo.id}.md`
      : `lic/docs/ecosystem/${todo.id}.md`;
  return [
    "---",
    "workflow_repo: lic",
    "cwd: .",
    `research_goal_id: ${goalId}`,
    "---",
    "",
    `# Plan backlog — \`${todo.id}\``,
    "",
    `- **content:** ${todo.content}`,
    "",
    "## Deliverables",
    `- Orchestration note: \`${noteRel}\``,
    "- Run gap ingest/apply scripts when the swarm_observer prompt requires it.",
    "- Commit + push on the plan-loop branch before stopping (when GH_TOKEN is set).",
    "",
    "## Rules",
    "- No product code in lic unless fixing control-plane orchestration.",
    "- Prefer swarm goals and handoffs over new systemd plan loops.",
  ].join("\n");
}
