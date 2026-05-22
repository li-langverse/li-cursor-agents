import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { agentsPackageRoot } from "../package-root.js";

/** Relative to li-cursor-agents package root — all registry skill IDs resolve here. */
export const AGENT_SKILLS_DIR = ".cursor/skills";

export function agentSkillsRoot(packageRoot?: string): string {
  return join(packageRoot ?? agentsPackageRoot(), AGENT_SKILLS_DIR);
}

export function skillMarkdownPath(skillId: string, packageRoot?: string): string {
  return join(agentSkillsRoot(packageRoot), skillId, "SKILL.md");
}

export function resolveAgentSkillPaths(skillIds: string[], packageRoot?: string): string[] {
  const root = packageRoot ?? agentsPackageRoot();
  return skillIds.map((id) => skillMarkdownPath(id, root));
}

export function loadSkillMarkdown(skillId: string, packageRoot?: string): string {
  const path = skillMarkdownPath(skillId, packageRoot);
  if (!existsSync(path)) {
    throw new Error(
      `Missing skill ${skillId}: ${path} (run ./scripts/sync-agent-skills.sh in li-cursor-agents)`,
    );
  }
  return readFileSync(path, "utf8");
}

export function appendSkillsToSystemPrompt(
  systemPrompt: string,
  skillIds: string[],
  packageRoot?: string,
): string {
  if (!skillIds.length) return systemPrompt;
  const root = packageRoot ?? agentsPackageRoot();
  const blocks: string[] = [
    systemPrompt,
    "",
    "---",
    "",
    "## Canonical agent skills (li-cursor-agents)",
    "",
    `Skill root: \`${AGENT_SKILLS_DIR}/\` in package \`${root}\``,
    "",
  ];
  for (const id of skillIds) {
    const body = loadSkillMarkdown(id, root);
    blocks.push(`### Skill: \`${id}\``, "", `Path: \`${skillMarkdownPath(id, root)}\``, "", body, "");
  }
  return blocks.join("\n");
}

/** Fail fast in CI when registry references skills not synced into this repo. */
export function assertRegistrySkillsOnDisk(
  skillIds: Iterable<string>,
  packageRoot?: string,
): { ok: true } | { ok: false; missing: string[] } {
  const missing: string[] = [];
  for (const id of skillIds) {
    if (!existsSync(skillMarkdownPath(id, packageRoot))) missing.push(id);
  }
  return missing.length ? { ok: false, missing } : { ok: true };
}

export function collectRegistrySkillIds(
  registry: Array<{ skills: string[] }>,
): string[] {
  const set = new Set<string>();
  for (const row of registry) {
    for (const s of row.skills) set.add(s);
  }
  return [...set].sort();
}
