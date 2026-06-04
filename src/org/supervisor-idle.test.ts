import assert from "node:assert/strict";
import test from "node:test";
import { idleLimitReached, parseMaxIdleCycles } from "./supervisor-idle.js";

test("parseMaxIdleCycles: 0 means run forever", () => {
  assert.equal(parseMaxIdleCycles("0"), Number.POSITIVE_INFINITY);
  assert.equal(idleLimitReached(999, parseMaxIdleCycles("0")), false);
});

test("parseMaxIdleCycles: positive uses limit", () => {
  assert.equal(parseMaxIdleCycles("3"), 3);
  assert.equal(idleLimitReached(3, 3), true);
});
