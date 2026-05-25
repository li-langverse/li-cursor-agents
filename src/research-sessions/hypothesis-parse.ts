import { randomUUID } from "node:crypto";
import type { HypothesisStatus, ResearchHypothesis } from "./types.js";

const OUTCOME_RE =
  /^\s*(?:HYPOTHESIS|hypothesis)\s*:\s*(verified|falsified|deferred|testing|proposed)\s*[—–-]\s*(.+?)(?:\s*\|\s*evidence:\s*(.+))?$/gim;

export interface ParsedHypothesisOutcome {
  statement: string;
  status: HypothesisStatus;
  evidence?: string;
}

export function parseHypothesisOutcomesFromOutput(text: string): ParsedHypothesisOutcome[] {
  const out: ParsedHypothesisOutcome[] = [];
  for (const m of text.matchAll(OUTCOME_RE)) {
    const status = m[1].toLowerCase() as HypothesisStatus;
    const statement = m[2].trim();
    if (!statement) continue;
    out.push({ statement, status, evidence: m[3]?.trim() });
  }
  return out;
}

export function mergeHypothesisOutcomes(
  existing: ResearchHypothesis[],
  parsed: ParsedHypothesisOutcome[],
): ResearchHypothesis[] {
  const now = new Date().toISOString();
  const byStatement = new Map(existing.map((h) => [h.statement.toLowerCase(), h]));
  for (const p of parsed) {
    const key = p.statement.toLowerCase();
    const prev = byStatement.get(key);
    if (prev) {
      byStatement.set(key, {
        ...prev,
        status: p.status,
        evidence: p.evidence ?? prev.evidence,
        retest_allowed: p.status === "falsified" || p.status === "deferred" ? true : prev.retest_allowed,
        updated_at: now,
      });
    } else {
      byStatement.set(key, {
        id: randomUUID(),
        statement: p.statement,
        status: p.status,
        evidence: p.evidence,
        retest_allowed: p.status === "falsified" || p.status === "deferred",
        updated_at: now,
      });
    }
  }
  return [...byStatement.values()];
}
