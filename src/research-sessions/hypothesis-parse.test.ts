import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeHypothesisOutcomes, parseHypothesisOutcomesFromOutput } from "./hypothesis-parse.js";

test("parseHypothesisOutcomesFromOutput", () => {
  const text = `
## Digest
HYPOTHESIS: falsified — parallel for without proof | evidence: li-tests/foo.li:12
HYPOTHESIS: verified — array bounds check in std | evidence: lic check passed
`;
  const parsed = parseHypothesisOutcomesFromOutput(text);
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].status, "falsified");
  assert.ok(parsed[1].evidence?.includes("lic check"));
});

test("mergeHypothesisOutcomes updates existing statement", () => {
  const merged = mergeHypothesisOutcomes(
    [
      {
        id: "a",
        statement: "parallel for without proof",
        status: "proposed",
        updated_at: "2026-01-01T00:00:00Z",
      },
    ],
    [{ statement: "parallel for without proof", status: "verified", evidence: "test T-1" }],
  );
  assert.equal(merged.length, 1);
  assert.equal(merged[0].status, "verified");
  assert.equal(merged[0].evidence, "test T-1");
});
