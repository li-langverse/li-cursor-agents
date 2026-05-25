import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { agentsPackageRoot } from "../runner.js";

export function researchResultsRoot(): string {
  const env = process.env.LI_RESEARCH_RESULTS_DIR?.trim();
  if (env) return env;
  return join(agentsPackageRoot(), "research-results");
}

export function researchBriefsDir(): string {
  return join(researchResultsRoot(), "briefs");
}

export function researchAssetsDir(): string {
  return join(researchResultsRoot(), "assets");
}

export function researchCatalogPath(): string {
  return join(researchResultsRoot(), "catalog.json");
}

export function researchSiteDataDir(): string {
  return join(researchResultsRoot(), "site", "data");
}

export function researchSiteCatalogPath(): string {
  return join(researchSiteDataDir(), "catalog.json");
}

export function ensureResearchResultsDirs(): void {
  for (const d of [researchResultsRoot(), researchBriefsDir(), researchAssetsDir(), researchSiteDataDir()]) {
    if (!existsSync(d)) mkdirSync(d, { recursive: true });
  }
}

export function briefSlug(goalId: string, runId: string): string {
  return `${goalId}--${runId}`.replace(/[^a-zA-Z0-9_-]+/g, "-");
}
