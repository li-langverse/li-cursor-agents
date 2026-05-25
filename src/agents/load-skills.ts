import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

function agentsPackageRoot(): string {
  const env = process.env.LI_CURSOR_AGENTS_ROOT;
  if (env && existsSync(join(env, "package.json"))) return env;
  const here = dirname(fileURLToPath(import.meta.url));
  const root = join(here, "..", "..");
  if (existsSync(join(root, "prompts"))) return root;
  return process.cwd();
}

const SKILL_FILE = "SKILL.md";

export function skillMarkdownPath(skillId: string, packageRoot = agentsPackageRoot()): string {
  return join(packageRoot, ".cursor", "skills", skillId, SKILL_FILE);
}

export function loadSkillMarkdown(skillId: string, packageRoot = agentsPackageRoot()): string | null {
  const id = skillId.trim();
  if (!id) return null;
  const path = skillMarkdownPath(id, packageRoot);
  if (!existsSync(path)) return null;
  return readFileSync(path, "utf8").trim() || null;
}

/** Append registry skill bodies to the system prompt so SDK runs see them. */
export function buildSkillsPromptAppendix(skillIds: string[], packageRoot = agentsPackageRoot()): string {
  const blocks: string[] = [];
  for (const id of skillIds) {
    const body = loadSkillMarkdown(id, packageRoot);
    if (!body) continue;
    blocks.push(`## Skill: ${id}\n\n${body}`);
  }
  return blocks.join("\n\n---\n\n");
}
