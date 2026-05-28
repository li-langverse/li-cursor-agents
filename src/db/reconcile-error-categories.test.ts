import assert from "node:assert/strict";
import test from "node:test";
import {
  isStaleReconcileError,
  STALE_RUNNING_RECONCILED,
  UNREGISTERED_RUNNING_RECONCILED,
} from "./reconcile-error-categories.js";

test("isStaleReconcileError treats boot reconcile codes as bookkeeping", () => {
  assert.equal(isStaleReconcileError(STALE_RUNNING_RECONCILED), true);
  assert.equal(isStaleReconcileError(UNREGISTERED_RUNNING_RECONCILED), true);
  assert.equal(isStaleReconcileError("sdk-session.lock: timeout"), false);
  assert.equal(isStaleReconcileError(""), false);
});
