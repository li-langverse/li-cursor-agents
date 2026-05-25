import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { BacklogTodo, ImplementBacklogFormat, ImplementGoal } from "./types.js";
import { resolveImplementGoalLicRoot } from "./lic-root.js";

const MARKDOWN_TODO_RE =
  /- id: (\S+)\n\s+content: (?:"([^"]+)"|([^\n]+))\n\s+status: (\w+)/g;

const PLAN_TODO_RE =
  /- id: (\S+)\n\s+content: "?([^"\n]+)"?\n\s+status: (\w+)/g;

export function parseBacklogTodos(text: string, format?: ImplementBacklogFormat): BacklogTodo[] {
  const fmt =
    format ?? (text.includes("docs/superpowers/plans/") ? "plan_yaml" : "markdown_todos");
  if (fmt === "plan_yaml") {
    const m = text.match(/^todos:\s*\n([\s\S]*?)^---\s*$/m);
    const block = m?.[1] ?? text;
    const todos: BacklogTodo[] = [];
    for (const match of block.matchAll(PLAN_TODO_RE)) {
      todos.push({
        id: match[1]!,
        content: match[2]!.trim(),
        status: match[3]!,
      });
    }
    return todos;
  }

  const todos: BacklogTodo[] = [];
  for (const match of text.matchAll(MARKDOWN_TODO_RE)) {
    todos.push({
      id: match[1]!,
      content: (match[2] ?? match[3] ?? "").trim(),
      status: match[4]!,
    });
  }
  return todos;
}

export function loadBacklogTodos(goal: ImplementGoal): BacklogTodo[] {
  const root = resolveImplementGoalLicRoot(goal);
  if (!root) return [];
  const path = join(root, goal.backlog_path);
  try {
    const text = readFileSync(path, "utf8");
    const format =
      goal.backlog_format ??
      (goal.backlog_path.includes("/plans/") ? "plan_yaml" : "markdown_todos");
    return parseBacklogTodos(text, format);
  } catch {
    return [];
  }
}

export function pickNextBacklogTodo(
  todos: BacklogTodo[],
  options?: { todoId?: string; preferInProgress?: boolean; completedIds?: Set<string> },
): BacklogTodo | null {
  const completed = options?.completedIds ?? new Set<string>();
  const preferInProgress = options?.preferInProgress ?? true;
  if (options?.todoId) {
    return todos.find((t) => t.id === options.todoId) ?? null;
  }

  const open = todos.filter(
    (t) =>
      (t.status === "pending" || t.status === "in_progress") && !completed.has(t.id),
  );
  if (!open.length) return null;

  open.sort((a, b) => {
    const rank = (s: string) => (s === "in_progress" ? 0 : 1);
    const d = rank(a.status) - rank(b.status);
    return d !== 0 ? d : a.id.localeCompare(b.id);
  });
  if (preferInProgress) return open[0]!;
  return open.find((t) => t.status === "pending") ?? open[0]!;
}

export function buildImplementGoalMarkdown(
  goal: ImplementGoal,
  todo: BacklogTodo,
  gatesPath: string,
): string {
  const lines = [
    "---",
    `workflow_repo: ${goal.workflow_repo}`,
    `implement_goal_id: ${goal.id}`,
    `backlog_todo_id: ${todo.id}`,
    `branch: ${goal.branch}`,
    "---",
    "",
    `# Implement goal: ${goal.id} — \`${todo.id}\``,
    "",
    goal.title,
    "",
    "## Current todo",
    `- **id:** ${todo.id}`,
    `- **content:** ${todo.content}`,
    `- **status in backlog:** ${todo.status} (set \`completed\` when done)`,
    "",
    "## Rules",
    `1. Work on branch \`${goal.branch}\` in the workflow repo (\`${goal.workflow_repo}\`).`,
    `2. Run gates before finishing: \`${gatesPath}\``,
    `3. PR-only — do not merge to main yourself; push and open/update PR.`,
    "",
    "## Mission",
    todo.content,
    "",
  ];
  return lines.join("\n");
}

export function markBacklogTodoDone(goal: ImplementGoal, todoId: string): boolean {
  const licRoot = resolveImplementGoalLicRoot(goal);
  if (!licRoot) return false;
  const path = join(licRoot, goal.backlog_path);
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return false;
  }
  const pattern = new RegExp(
    `(- id:\\s*${todoId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\n\\s+content:[^\\n]*\\n\\s+status:)\\s*\\w+`,
    "m",
  );
  if (!pattern.test(text)) return false;
  const next = text.replace(pattern, "$1 completed");
  writeFileSync(path, next, "utf8");
  return true;
}
