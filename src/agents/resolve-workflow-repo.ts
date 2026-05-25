import { readFileSync } from "node:fs";

/** Strongest-first path/topic → org repo short name (li-langverse/<repo>). */
export const REPO_SIGNALS: ReadonlyArray<{ repo: string; patterns: RegExp[] }> = [
  {
    repo: "li-cursor-agents",
    patterns: [/li-cursor-agents/i, /\bdashboard-ui\b/, /\basync-swarm\b/, /prompts\/code-implementer/],
  },
  { repo: "benchmarks", patterns: [/agent-briefing\.py/i, /explorer-digest/i, /\bbenchmarks\/data\b/] },
  { repo: "roadmap", patterns: [/\broadmap\/docs\b/, /\bproposals\//] },
  { repo: "studio.ai", patterns: [/studio\.ai/i, /li-studio-ai/i] },
  {
    repo: "studio",
    patterns: [
      /\bstudio\b/i,
      /world-studio/i,
      /PH-GD-/i,
      /PH-UX-/i,
      /\bux-0\b/i,
      /world\.li\b/,
      /studio\.toml/,
    ],
  },
  { repo: "ui", patterns: [/\bli-ui\b/i, /\borg\/ui\b/, /ux-harness\/baselines/] },
  { repo: "sim", patterns: [/\bli-sim\b/i, /sim-algo/i, /\bsimulation_techniques\b/] },
  { repo: "render", patterns: [/\bli-render\b/i, /\brender\b/i] },
  { repo: "lip", patterns: [/\blip\b/i, /lip\.toml/i] },
  { repo: "lit", patterns: [/\blit\b/i, /lit test/i] },
  { repo: "lis", patterns: [/\blis\b/i, /tier5_http/] },
  {
    repo: "lic",
    patterns: [
      /\blic\b/i,
      /li-langverse\/lic/i,
      /\bstd\//,
      /\bli-tests\//,
      /trusted\.lean/,
      /httpd-plan/i,
      /li-httpd/i,
      /\bhttpd\b/i,
      /match_routes/,
      /PH-2[ef]/i,
      /compiler/i,
      /game_engine_ux/i,
      /cad_fundamentals/i,
    ],
  },
];

const FRONTMATTER_REPO = /^workflow_repo:\s*([a-z0-9._-]+)\s*$/im;
const BODY_REPO_LINE = /^workflow\s+repo:\s*([a-z0-9._-]+)\s*$/im;

export function resolveWorkflowRepoFromText(
  text: string,
  options?: { fallback?: string },
): string | undefined {
  const trimmed = text.trim();
  if (!trimmed) return options?.fallback;

  const fm = trimmed.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (fm) {
    const repoFromFm = fm[1].match(FRONTMATTER_REPO)?.[1]?.trim();
    if (repoFromFm) return repoFromFm;
  }

  const bodyLine = trimmed.match(BODY_REPO_LINE)?.[1]?.trim();
  if (bodyLine) return bodyLine;

  const ghRepo = trimmed.match(/github\.com\/li-langverse\/([a-z0-9._-]+)/i)?.[1];
  if (ghRepo) return ghRepo;

  for (const { repo, patterns } of REPO_SIGNALS) {
    if (patterns.some((p) => p.test(trimmed))) return repo;
  }

  return options?.fallback;
}

export function resolveWorkflowRepoFromGoalFile(path: string, fallback?: string): string | undefined {
  const text = readFileSync(path, "utf8");
  return resolveWorkflowRepoFromText(text, { fallback });
}
