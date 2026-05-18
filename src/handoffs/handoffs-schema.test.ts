import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isMissingAgentHandoffsTable } from "./handoffs-schema.js";

describe("isMissingAgentHandoffsTable", () => {
  it("detects PostgREST schema cache message", () => {
    assert.equal(
      isMissingAgentHandoffsTable(
        new Error(
          "listHandoffs: Could not find the table 'public.agent_handoffs' in the schema cache",
        ),
      ),
      true,
    );
  });

  it("ignores unrelated errors", () => {
    assert.equal(isMissingAgentHandoffsTable(new Error("timeout")), false);
  });
});
