export interface OrgPrRow {
  repo: string;
  number: number;
}

import { gitlabGroup, gitlabHost, vcsProvider, vcsToken } from "./vcs-config.js";

const ORG = "li-langverse";
const GITHUB_API = "https://api.github.com";

export function rowMatchesLabelFilter(
  row: OrgPrRow,
  labelsByKey: ReadonlyMap<string, readonly string[]>,
  requiredLabels: readonly string[],
): boolean {
  if (requiredLabels.length === 0) return true;
  const key = `${row.repo}#${row.number}`;
  const labels = labelsByKey.get(key) ?? [];
  return requiredLabels.some((want) => labels.includes(want));
}

export function filterQueueRowsByLabels<T extends OrgPrRow>(
  rows: T[],
  labelsByKey: ReadonlyMap<string, readonly string[]>,
  requiredLabels: readonly string[],
): T[] {
  if (requiredLabels.length === 0) return rows;
  return rows.filter((row) => rowMatchesLabelFilter(row, labelsByKey, requiredLabels));
}

/** Fetch VCS labels for queue rows (best-effort; missing rows stay unlabeled). */
export async function loadLabelsForQueueRows(
  rows: OrgPrRow[],
  options?: { token?: string; fetchImpl?: typeof fetch },
) {
  const token = options?.token ?? vcsToken();
  const fetchFn = options?.fetchImpl ?? fetch;
  const out = new Map<string, string[]>();
  if (!token || rows.length === 0) return out;

  for (const row of rows) {
    const key = `${row.repo}#${row.number}`;
    if (out.has(key)) continue;
    try {
      if (vcsProvider() === "gitlab") {
        const project = encodeURIComponent(`${gitlabGroup()}/${row.repo}`);
        const url = `https://${gitlabHost()}/api/v4/projects/${project}/merge_requests/${row.number}`;
        const resp = await fetchFn(url, {
          headers: { "PRIVATE-TOKEN": token },
        });
        if (!resp.ok) continue;
        const data = (await resp.json()) as { labels?: string[] };
        out.set(key, (data.labels ?? []).filter((n) => Boolean(n)));
      } else {
        const url = `${GITHUB_API}/repos/${ORG}/${row.repo}/issues/${row.number}`;
        const resp = await fetchFn(url, {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
          },
        });
        if (!resp.ok) continue;
        const data = (await resp.json()) as { labels?: { name?: string }[] };
        out.set(
          key,
          (data.labels ?? []).map((l) => l.name).filter((n): n is string => Boolean(n)),
        );
      }
    } catch {
      /* skip row */
    }
  }
  return out;
}
