import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { computeSwarmDegraded } from "./degraded.js";
import type { SwarmHealthReport } from "./types.js";

describe("computeSwarmDegraded", () => {
  test("false when healthy", () => {
    const h: SwarmHealthReport = {
      scanned_at: "",
      healthy: true,
      findings: [],
      remediations: [],
      runs_sampled: 0,
      error_rate: 0,
      needs_meta_observer: false,
    };
    assert.equal(computeSwarmDegraded(h), false);
  });

  test("false when remediations remain", () => {
    const h: SwarmHealthReport = {
      scanned_at: "",
      healthy: false,
      findings: [
        {
          kind: "agent_error_streak",
          severity: "medium",
          title: "x",
          detail: "y",
          auto_healable: true,
        },
      ],
      remediations: [{ kind: "retry_agent", agentId: "bug_fixer", reason: "retry" }],
      runs_sampled: 1,
      error_rate: 0.5,
      needs_meta_observer: false,
    };
    assert.equal(computeSwarmDegraded(h), false);
  });

  test("true when critical and no remediations", () => {
    const h: SwarmHealthReport = {
      scanned_at: "",
      healthy: false,
      findings: [
        {
          kind: "sdk_unavailable",
          severity: "critical",
          title: "no key",
          detail: "missing",
          auto_healable: false,
        },
      ],
      remediations: [],
      runs_sampled: 1,
      error_rate: 1,
      needs_meta_observer: true,
    };
    assert.equal(computeSwarmDegraded(h), true);
  });
});
