#!/usr/bin/env python3
"""Idempotent patch: add AgentRunTokenUsage to agent-run-trace.ts."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TARGET = ROOT / "src" / "agent-run-trace.ts"
TEST = ROOT / "src" / "agent-run-trace.test.ts"

TOKEN_INTERFACE = '''
export interface AgentRunTokenUsage {
  input_tokens: number;
  output_tokens: number;
  thinking_tokens: number;
  thinking_chars: number;
  thinking_tokens_estimated: boolean;
  delta_event_count: number;
}
'''

HELPERS = '''
export function estimateTokensFromChars(chars: number): number {
  return max(0, int((chars + 3) / 4))
}

def _empty_token_usage():
    return {
        "input_tokens": 0,
        "output_tokens": 0,
        "thinking_tokens": 0,
        "thinking_chars": 0,
        "thinking_tokens_estimated": False,
        "delta_event_count": 0,
    }
'''

# Simpler: read file and check marker
text = TARGET.read_text(encoding="utf-8")
if "AgentRunTokenUsage" in text:
    print("agent-run-trace.ts already patched")
    raise SystemExit(0)

# Insert interface before AgentRunTrace
needle = "export interface AgentRunTrace {"
if needle not in text:
    raise SystemExit("could not find AgentRunTrace interface")

insert = '''export interface AgentRunTokenUsage {
  input_tokens: number;
  output_tokens: number;
  thinking_tokens: number;
  thinking_chars: number;
  thinking_tokens_estimated: boolean;
  delta_event_count: number;
}

'''
text = text.replace(needle, insert + needle, 1)
text = text.replace(
    "  tool_call_count: number;\n  /** Cursor SDK retry",
    "  tool_call_count: number;\n  token_usage?: AgentRunTokenUsage;\n  /** Cursor SDK retry",
    1,
)

# Add helpers before createTraceCollector
marker = "export function createTraceCollector():"
helpers_ts = '''
export function estimateTokensFromChars(chars: number): number {
  return Math.max(0, Math.ceil(chars / 4));
}

function emptyTokenUsage(): AgentRunTokenUsage {
  return {
    input_tokens: 0,
    output_tokens: 0,
    thinking_tokens: 0,
    thinking_chars: 0,
    thinking_tokens_estimated: false,
    delta_event_count: 0,
  };
}

export function accumulateInteractionTokenUsage(
  acc: AgentRunTokenUsage,
  update: InteractionUpdate,
): void {
  const u = update as Record<string, unknown>;
  acc.delta_event_count += 1;
  switch (update.type) {
    case "token-delta": {
      const n = typeof u.tokens === "number" ? u.tokens : 0;
      const role = String(u.role ?? u.kind ?? "").toLowerCase();
      if (role.includes("input") || role.includes("prompt")) acc.input_tokens += n;
      else acc.output_tokens += n;
      break;
    }
    case "thinking-delta": {
      const t = typeof u.text === "string" ? u.text : "";
      if (t) {
        acc.thinking_chars += t.length;
        acc.thinking_tokens += estimateTokensFromChars(t.length);
        acc.thinking_tokens_estimated = true;
      }
      break;
    }
    case "text-delta": {
      const t = typeof u.text === "string" ? u.text : "";
      if (t) acc.output_tokens += estimateTokensFromChars(t.length);
      break;
    }
    default:
      break;
  }
}

export function computeTokenUsageFromTrace(trace: AgentRunTrace): AgentRunTokenUsage {
  const acc = emptyTokenUsage();
  for (const row of trace.deltas) {
    if (row.kind !== "delta") continue;
    acc.delta_event_count += 1;
    const p = row.payload as Record<string, unknown> | undefined;
    if (row.type === "thinking-delta" && typeof p?.text === "string") {
      acc.thinking_chars += p.text.length;
      acc.thinking_tokens += estimateTokensFromChars(p.text.length);
      acc.thinking_tokens_estimated = true;
    } else if (row.type === "text-delta" && typeof p?.text === "string") {
      acc.output_tokens += estimateTokensFromChars(p.text.length);
    } else if (row.type === "token-delta" && typeof p?.tokens === "number") {
      const role = String(p.role ?? p.kind ?? "").toLowerCase();
      if (role.includes("input") || role.includes("prompt")) acc.input_tokens += p.tokens;
      else acc.output_tokens += p.tokens;
    }
  }
  if (trace.thinking_text && acc.thinking_chars === 0) {
    acc.thinking_chars = trace.thinking_text.length;
    acc.thinking_tokens = estimateTokensFromChars(trace.thinking_text.length);
    acc.thinking_tokens_estimated = true;
  }
  return acc;
}

'''
if marker not in text:
    raise SystemExit("createTraceCollector not found")
text = text.replace(marker, helpers_ts + marker, 1)

text = text.replace(
    "  const thinkingParts: string[] = [];\n\n  return {",
    "  const thinkingParts: string[] = [];\n  const tokenUsage = emptyTokenUsage();\n\n  return {",
    1,
)
text = text.replace(
    "      const type = update.type;\n      if (type === \"thinking-delta\"",
    "      const type = update.type;\n      accumulateInteractionTokenUsage(tokenUsage, update);\n      if (type === \"thinking-delta\"",
    1,
)
text = text.replace(
    "buildTraceSnapshot(steps, deltas, thinkingParts, assistantText)",
    "buildTraceSnapshot(steps, deltas, thinkingParts, assistantText, tokenUsage)",
)
text = text.replace(
    "  assistantText: string,\n): AgentRunTrace {",
    "  assistantText: string,\n  tokenUsage: AgentRunTokenUsage,\n): AgentRunTrace {",
    1,
)
text = text.replace(
    "    tool_call_count,\n  };\n}\n\nfunction compactDeltaPayload",
    """    tool_call_count,
    token_usage: (() => {
      const usage = { ...tokenUsage };
      if (thinkingParts.length && usage.thinking_chars === 0) {
        const joined = thinkingParts.join("");
        usage.thinking_chars = joined.length;
        usage.thinking_tokens = estimateTokensFromChars(joined.length);
        usage.thinking_tokens_estimated = true;
      }
      return usage;
    })(),
  };
}

function compactDeltaPayload""",
    1,
)
text = text.replace(
    "    tool_call_count: 2,\n  };\n}",
    """    tool_call_count: 2,
    token_usage: {
      input_tokens: 0,
      output_tokens: estimateTokensFromChars(params.assistantText.length),
      thinking_tokens: estimateTokensFromChars(15),
      thinking_chars: 15,
      thinking_tokens_estimated: true,
      delta_event_count: 2,
    },
  };
}""",
    1,
)

TARGET.write_text(text, encoding="utf-8")
print("patched", TARGET)

# Patch test file
tt = TEST.read_text(encoding="utf-8")
if "thinking_tokens" not in tt:
    tt = tt.replace(
        "  createTraceCollector,\n} from",
        "  computeTokenUsageFromTrace,\n  createTraceCollector,\n  estimateTokensFromChars,\n} from",
    )
    tt = tt.replace(
        "    assert.equal(trace.steps.length, 1);\n  });",
        """    assert.equal(trace.steps.length, 1);
    assert.ok(trace.token_usage);
  });

  it("accumulates thinking tokens", () => {
    const c = createTraceCollector();
    c.onDelta({
      update: { type: "thinking-delta", text: "plan" } as import("@cursor/sdk").InteractionUpdate,
    });
    const trace = c.finalize("");
    assert.ok((trace.token_usage?.thinking_tokens ?? 0) > 0);
  });

  it("computeTokenUsageFromTrace on mock", () => {
    const trace = buildMockTrace({
      definitionId: "x",
      assistantText: "ok",
      userMessage: "u",
      cwd: "/tmp",
    });
    assert.ok(computeTokenUsageFromTrace(trace).output_tokens > 0);
  });""",
    )
    TEST.write_text(tt, encoding="utf-8")
    print("patched", TEST)
