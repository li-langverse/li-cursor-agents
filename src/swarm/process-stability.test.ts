import assert from "node:assert/strict";
import test from "node:test";
import { isAbortLikeProcessError } from "./process-stability.js";

test("isAbortLikeProcessError matches ConnectError canceled", () => {
  assert.equal(
    isAbortLikeProcessError({ name: "ConnectError", message: "[canceled] This operation was aborted" }),
    true,
  );
});

test("isAbortLikeProcessError rejects ordinary errors", () => {
  assert.equal(isAbortLikeProcessError(new Error("disk full")), false);
});
