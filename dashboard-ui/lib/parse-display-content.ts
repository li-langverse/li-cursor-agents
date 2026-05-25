export type DisplayContentKind = "markdown" | "json" | "plain";

export interface ParsedDisplayContent {
  kind: DisplayContentKind;
  /** Text for markdown/plain renderers */
  text: string;
  /** Parsed JSON value when kind === "json" */
  json?: unknown;
}

function looksLikeMarkdown(text: string): boolean {
  if (text.length < 2) return false;
  if (/^#{1,6}\s/m.test(text)) return true;
  if (/```[\s\S]*?```/m.test(text)) return true;
  if (/^\s*[-*+]\s+/m.test(text)) return true;
  if (/^\s*\d+\.\s+/m.test(text)) return true;
  if (/\*\*[^*]+\*\*/.test(text)) return true;
  if (/^>\s/m.test(text)) return true;
  if (/\[[^\]]+\]\([^)]+\)/.test(text)) return true;
  return false;
}

function tryParseJson(raw: string): unknown | undefined {
  const t = raw.trim();
  if (!(t.startsWith("{") || t.startsWith("["))) return undefined;
  try {
    return JSON.parse(t) as unknown;
  } catch {
    return undefined;
  }
}

function jsonValueToMarkdown(value: unknown): string | undefined {
  if (typeof value === "string" && looksLikeMarkdown(value)) return value;
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    const o = value as Record<string, unknown>;
    const pick = o.text ?? o.content ?? o.message ?? o.output ?? o.assistant_text;
    if (typeof pick === "string" && looksLikeMarkdown(pick)) return pick;
    if (typeof pick === "string" && pick.length > 0) return pick;
  }
  return undefined;
}

/** Normalize agent output / prompts for RichContent (unwrap JSON wrappers, detect markdown). */
export function parseDisplayContent(raw: string | null | undefined): ParsedDisplayContent {
  const text = (raw ?? "").trim();
  if (!text) return { kind: "plain", text: "" };

  const parsed = tryParseJson(text);
  if (parsed !== undefined) {
    const asMd = jsonValueToMarkdown(parsed);
    if (asMd) return { kind: "markdown", text: asMd };
    if (typeof parsed === "string") {
      if (looksLikeMarkdown(parsed)) return { kind: "markdown", text: parsed };
      return { kind: "plain", text: parsed };
    }
    return { kind: "json", text, json: parsed };
  }

  if (looksLikeMarkdown(text)) return { kind: "markdown", text };
  return { kind: "plain", text };
}

/** One-line preview: strip markdown noise for cards. */
export function previewPlainText(raw: string | null | undefined, maxLen = 160): string {
  const { kind, text, json } = parseDisplayContent(raw);
  let out = text;
  if (kind === "json" && json !== undefined) {
    out =
      typeof json === "string"
        ? json
        : typeof json === "object" && json !== null && "summary" in json
          ? String((json as { summary: unknown }).summary)
          : "Structured JSON response";
  }
  out = out
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/```[\s\S]*?```/g, " … ")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\n+/g, " ")
    .trim();
  if (out.length <= maxLen) return out || "—";
  return `${out.slice(0, maxLen - 1)}…`;
}
