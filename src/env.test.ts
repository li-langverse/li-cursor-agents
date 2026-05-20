import { test } from "node:test";
import assert from "node:assert/strict";
import { CURSOR_MODEL_AUTO_ID, normalizeCursorModelId } from "./env.js";

test("normalizeCursorModelId maps auto aliases to default", () => {
  assert.equal(normalizeCursorModelId(undefined), CURSOR_MODEL_AUTO_ID);
  assert.equal(normalizeCursorModelId(""), CURSOR_MODEL_AUTO_ID);
  assert.equal(normalizeCursorModelId("auto"), CURSOR_MODEL_AUTO_ID);
  assert.equal(normalizeCursorModelId("Auto"), CURSOR_MODEL_AUTO_ID);
  assert.equal(normalizeCursorModelId("default"), CURSOR_MODEL_AUTO_ID);
  assert.equal(normalizeCursorModelId("composer-2"), "composer-2");
});
