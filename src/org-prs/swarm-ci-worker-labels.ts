export interface OrgPrRow {
  repo: string;
  number: number;
}

const ORG = "li-langverse";
const API = "https://api.github.com";
export function rowMatchesLabelFilter(row: OrgPrRow, labelsByKey: ReadonlyMap<string, readonly string[]>, requiredLabels: readonly string[]): boolean {
    if (requiredLabels.length === 0)
        return true;
    const key = `${row.repo}#${row.number}`;
    const labels = labelsByKey.get(key) ?? [];
    return requiredLabels.some((want) => labels.includes(want));
}
export function filterQueueRowsByLabels<T extends OrgPrRow>(rows: T[], labelsByKey: ReadonlyMap<string, readonly string[]>, requiredLabels: readonly string[]): T[] {
    if (requiredLabels.length === 0)
        return rows;
    return rows.filter((row) => rowMatchesLabelFilter(row, labelsByKey, requiredLabels));
}
function githubToken() {
    return process.env.GH_TOKEN?.trim() || process.env.GITHUB_TOKEN?.trim();
}
/** Fetch GitHub labels for queue rows (best-effort; missing rows stay unlabeled). */
export async function loadLabelsForQueueRows(rows: OrgPrRow[], options?: { token?: string; fetchImpl?: typeof fetch }) {
    const token = options?.token ?? githubToken();
    const fetchFn = options?.fetchImpl ?? fetch;
    const out = new Map();
    if (!token || rows.length === 0)
        return out;
    for (const row of rows) {
        const key = `${row.repo}#${row.number}`;
        if (out.has(key))
            continue;
        try {
            const url = `${API}/repos/${ORG}/${row.repo}/issues/${row.number}`;
            const resp = await fetchFn(url, {
                headers: {
                    Authorization: `Bearer ${token}`,
                    Accept: "application/vnd.github+json",
                    "X-GitHub-Api-Version": "2022-11-28",
                },
            });
            if (!resp.ok)
                continue;
            const data = (await resp.json()) as { labels?: { name?: string }[] };
            out.set(key, (data.labels ?? []).map((l) => l.name).filter((n) => Boolean(n)));
        }
        catch {
            /* skip row */
        }
    }
    return out;
}