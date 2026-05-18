import assert from "node:assert/strict";
import test from "node:test";
import { overviewInSdkCount } from "./in-sdk-count.js";

test("overviewInSdkCount prefers max of runtime metrics and status map", () => {
  assert.equal(
    overviewInSdkCount({ active_run_count: 0, sdk_sessions_active: 2 }, 1),
    2,
  );
  assert.equal(overviewInSdkCount({ active_run_count: 3 }, 1), 3);
  assert.equal(overviewInSdkCount(undefined, 2), 2);
});
