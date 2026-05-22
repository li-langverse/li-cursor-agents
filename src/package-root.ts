import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** li-cursor-agents package root (where prompts/ and .cursor/skills/ live). */
export function agentsPackageRoot(): string {
  const env = process.env.LI_CURSOR_AGENTS_ROOT;
  if (env && existsSync(join(env, "package.json"))) return env;
  const here = dirname(fileURLToPath(import.meta.url));
  const root = join(here, "..");
  if (existsSync(join(root, "prompts"))) return root;
  return process.cwd();
}
