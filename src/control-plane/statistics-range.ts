/** Preset and custom time windows for swarm statistics. */

export type StatisticsRangePreset = "1d" | "7d" | "30d" | "365d" | "all" | "custom";

export interface StatisticsTimeWindow {
  preset: StatisticsRangePreset;
  since: string;
  until: string;
  label: string;
}

const MS_DAY = 86_400_000;

export function parseStatisticsRangeFromSearchParams(
  params: URLSearchParams,
): StatisticsTimeWindow {
  const preset = normalizePreset(params.get("range") ?? params.get("preset") ?? "7d");
  const untilParam = params.get("until")?.trim();
  const sinceParam = params.get("since")?.trim();
  const until = untilParam ? new Date(untilParam) : new Date();
  if (Number.isNaN(until.getTime())) {
    throw new Error("invalid until date");
  }

  if (preset === "custom") {
    if (!sinceParam) throw new Error("custom range requires since= ISO timestamp");
    const since = new Date(sinceParam);
    if (Number.isNaN(since.getTime())) throw new Error("invalid since date");
    if (since.getTime() > until.getTime()) throw new Error("since must be before until");
    return {
      preset,
      since: since.toISOString(),
      until: until.toISOString(),
      label: `custom ${since.toISOString().slice(0, 10)} → ${until.toISOString().slice(0, 10)}`,
    };
  }

  if (preset === "all") {
    return {
      preset,
      since: new Date(0).toISOString(),
      until: until.toISOString(),
      label: "all time",
    };
  }

  const days = preset === "1d" ? 1 : preset === "7d" ? 7 : preset === "30d" ? 30 : 365;
  const since = new Date(until.getTime() - days * MS_DAY);
  return {
    preset,
    since: since.toISOString(),
    until: until.toISOString(),
    label: preset === "1d" ? "last 24 hours" : `last ${days} days`,
  };
}

function normalizePreset(raw: string): StatisticsRangePreset {
  const v = raw.toLowerCase();
  if (v === "1d" || v === "24h" || v === "day") return "1d";
  if (v === "7d" || v === "week") return "7d";
  if (v === "30d" || v === "1m" || v === "month") return "30d";
  if (v === "365d" || v === "1y" || v === "year") return "365d";
  if (v === "all" || v === "all-time") return "all";
  if (v === "custom") return "custom";
  return "7d";
}

export function runStartedInWindow(startedAt: string, since: string, until: string): boolean {
  const t = new Date(startedAt).getTime();
  if (Number.isNaN(t)) return false;
  return t >= new Date(since).getTime() && t <= new Date(until).getTime();
}
