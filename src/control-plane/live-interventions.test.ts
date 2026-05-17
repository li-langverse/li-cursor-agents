import { test } from "node:test";
import assert from "node:assert/strict";
import {
  filterInterventionsForOpenPrs,
  openPrKeysFromBriefing,
  parsePrKeyFromIntervention,
} from "./live-interventions.js";
import type { HumanIntervention } from "./types.js";

test("parsePrKeyFromIntervention extracts repo#number", () => {
  const iv: HumanIntervention = {
    id: "human_merge:x",
    kind: "human_merge",
    severity: "high",
    title: "Ready to merge: lic#42",
    detail: "",
    action: "",
    links: ["https://github.com/li-langverse/lic/pull/42"],
    created_at: "",
  };
  assert.equal(parsePrKeyFromIntervention(iv), "lic#42");
});

test("filterInterventionsForOpenPrs drops merged PR not in all_open", () => {
  const briefing = {
    pr_program: {
      all_open: [{ repo: "lic", number: 99, merge_approved: true, gate_ready_with_approval: true }],
    },
  };
  const interventions: HumanIntervention[] = [
    {
      id: "a",
      kind: "human_merge",
      severity: "high",
      title: "Ready to merge: lic#42",
      detail: "old",
      action: "",
      links: [],
      created_at: "",
    },
    {
      id: "b",
      kind: "human_merge",
      severity: "high",
      title: "Ready to merge: lic#99",
      detail: "open",
      action: "",
      links: [],
      created_at: "",
    },
    {
      id: "c",
      kind: "ci_red",
      severity: "medium",
      title: "red bench",
      detail: "",
      action: "",
      links: [],
      created_at: "",
    },
  ];
  const filtered = filterInterventionsForOpenPrs(interventions, briefing);
  assert.equal(filtered.length, 2);
  assert.ok(filtered.some((i) => i.title.includes("#99")));
  assert.ok(!filtered.some((i) => i.title.includes("#42")));
});

test("openPrKeysFromBriefing includes merge_plan next_merge", () => {
  const keys = openPrKeysFromBriefing({
    pr_program: { all_open: [] },
    merge_plan: { next_merge: { repo: "roadmap", number: 1 } },
  });
  assert.ok(keys.has("roadmap#1"));
});
