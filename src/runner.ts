import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getAgent } from "./agents/registry.js";
import { CursorSdkBackend } from "./backends/cursor-sdk-backend.js";
import { MockBackend } from "./backends/mock-backend.js";
import { buildUserMessage, runPreflight, resolveBenchmarksRoot } from "./preflight.js";
import type { AgentRunOptions, AgentRunResult } from "./types.js";

/** li-cursor-agents package root (where prompts/ lives). */
export function agentsPackageRoot(): string {
  const env = process.env.LI_CURSOR_AGENTS_ROOT;
  if (env && existsSync(join(env, "package.json"))) return env;
  const here = dirname(fileURLToPath(import.meta.url));
  const root = join(here, "..");
  if (existsSync(join(root, "prompts"))) return root;
  return process.cwd();
}

export function loadPrompt(repoRoot: string, promptFile: string): string {
  const p = join(repoRoot, "prompts", promptFile);
  if (!existsSync(p)) {
    throw new Error(`Missing prompt: ${p} (sync from benchmarks/.cursor/automations/)`);
  }
  return readFileSync(p, "utf8");
}

export function shouldUseMock(explicitMock: boolean): boolean {
  if (explicitMock) return true;
  if (process.env.CURSOR_MOCK === "1" || process.env.CURSOR_MOCK === "true") return true;
  if (process.env.CI === "true" && !process.env.CURSOR_API_KEY) return true;
  return false;
}

export async function runAgent(options: AgentRunOptions): Promise<AgentRunResult> {
  const definition = getAgent(String(options.agentId));
  if (!definition) {
    throw new Error(`Unknown agent: ${options.agentId} (see npm run agents:list)`);
  }

  const packageRoot = agentsPackageRoot();
  const benchmarksRoot = resolveBenchmarksRoot(options.benchmarksRoot);
  const preflight = runPreflight(benchmarksRoot, true);
  const systemPrompt = loadPrompt(packageRoot, definition.promptFile);
  const workCwd = options.cwd || packageRoot;
  const userMessage = buildUserMessage(definition.id, preflight, options.extraInstruction);

  const mock = shouldUseMock(options.mock);
  const backend = mock ? new MockBackend() : new CursorSdkBackend();

  return backend.run(definition, systemPrompt, userMessage, { ...options, cwd: workCwd });
}
