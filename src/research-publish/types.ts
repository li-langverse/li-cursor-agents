export interface ResearchBenchmarkRow {
  name: string;
  metric: string;
  value: string;
  baseline?: string;
  unit?: string;
}

export interface ResearchPlotRef {
  caption: string;
  /** Repo-relative path under research-results/assets/ or external URL */
  src: string;
}

export interface ResearchComparisonRow {
  label: string;
  li: string;
  baseline: string;
  delta?: string;
  notes?: string;
}

export interface ResearchBrief {
  version: 1;
  title: string;
  goal_id: string;
  agent_id: string;
  run_id: string;
  published_at: string;
  north_star_fit?: string;
  hypothesis: {
    statement: string;
    status: "proposed" | "testing" | "verified" | "falsified" | "deferred";
  };
  discovery: string;
  methodology?: string;
  benchmark_results: ResearchBenchmarkRow[];
  comparison: ResearchComparisonRow[];
  plots: ResearchPlotRef[];
  evidence_links: string[];
  /** When false, brief is draft-only (not listed on public index). */
  publish: boolean;
}

export interface ResearchCatalogEntry {
  id: string;
  title: string;
  goal_id: string;
  agent_id: string;
  run_id: string;
  published_at: string;
  hypothesis_status: string;
  markdown_path: string;
  json_path: string;
}

export interface ResearchCatalog {
  version: 1;
  updated_at: string;
  briefs: ResearchCatalogEntry[];
}
