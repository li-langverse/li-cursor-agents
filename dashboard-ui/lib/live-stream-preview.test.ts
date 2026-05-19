import assert from "node:assert/strict";
import test from "node:test";
import { deriveLiveStreamPreview } from "./live-stream-preview.js";

test("deriveLiveStreamPreview surfaces assistant stream text", () => {
  const p = deriveLiveStreamPreview({
    run_trace: {
      assistant_text: "Implementing heap control plane",
      tool_call_count: 0,
    },
  });
  assert.equal(p.headline, "Writing");
  assert.match(p.detail, /heap/);
});
