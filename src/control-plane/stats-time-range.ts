/** Parse dashboard statistics window from query params. */

export type StatsRangePreset = "1d" | "7d" | "30d" | "365d" | "all" | "custom";

export interface ParsedStatsTimeRange {
  preset: StatsRangePreset;
  since: Date | null;
  until: Date;
  label: string;
}

const DAY_MS = 86_400_000;

function parseIsoParam(raw: string | null): Date | null {
  if (!raw?.trim()) return null;
  const d = new Date(raw.trim());
  return Number.isNaN(d.getTime()) ? null : d;
}

export function parseStatsTimeRange(searchParams: URLSearchParams): ParsedStatsTimeRange {
  const until =
    parseIsoParam(searchParams.get("until")) ??
    parseIsoParam(searchParams.get("to")) ??
    new Date();
  const presetRaw = (searchParams.get("range") ?? searchParams.get("preset") ?? "all").toLowerCase();

  if (presetRaw === "custom") {
    const since = parseIsoParam(searchParams.get("since")) ?? parseIsoParam(searchParams.get("from"));
    return {
      preset: "custom",
      since,
      until,
      label: since ? `${since.toISOString()} → ${until.toISOString()}` : "custom (all time)",
    };
  }

  const preset = (
    ["1d", "7d", "30d", "365d", "all"].includes(presetRaw) ? presetRaw : "all"
  ) as StatsRangePreset;

  if (preset === "all") {
    return { preset: "all", since: null, until, label: "all time" };
  }

  const days = preset === "1d" ? 1 : preset === "7d" ? 7 : preset === "30d" ? 30 : 365;
  const since = new Date(until.getTime() - days * DAY_MS);
  const labels: Record<string, string> = {
    "1d": "last 24 hours",
    "7d": "last 7 days",
    "30d": "last 30 days",
    "365d": "last year",
  };
  return { preset, since, until, label: labels[preset] ?? preset };
}
