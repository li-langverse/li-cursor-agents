import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CURSOR_MODEL_AUTO_ID,
  isPlausibleCursorApiKey,
  normalizeCursorModelId,
  resolveCursorApiKey,
} from "./env.js";

test("normalizeCursorModelId maps auto aliases to default", () => {
  assert.equal(normalizeCursorModelId(undefined), CURSOR_MODEL_AUTO_ID);
  assert.equal(normalizeCursorModelId(""), CURSOR_MODEL_AUTO_ID);
  assert.equal(normalizeCursorModelId("auto"), CURSOR_MODEL_AUTO_ID);
  assert.equal(normalizeCursorModelId("Auto"), CURSOR_MODEL_AUTO_ID);
  assert.equal(normalizeCursorModelId("default"), CURSOR_MODEL_AUTO_ID);
  assert.equal(normalizeCursorModelId("composer-2"), "composer-2");
});

test("isPlausibleCursorApiKey rejects dashboard URLs", () => {
  assert.equal(isPlausibleCursorApiKey("https://cursor.com/dashboard/secrets"), false);
  assert.equal(isPlausibleCursorApiKey("http://example.com/key"), false);
  assert.equal(isPlausibleCursorApiKey("short"), false);
  assert.equal(isPlausibleCursorApiKey("key_0123456789012345678901234567890"), true);
});

test("resolveCursorApiKey skips URL-shaped CURSOR_API_KEY when SDK_KEY is plausible", () => {
  const keys = ["CURSOR_API_KEY", "CURSOR_SDK_KEY", "CURSOR_SDK", "CURSOR_API_TOKEN"] as const;
  const prev: Record<string, string | undefined> = {};
  for (const k of keys) prev[k] = process.env[k];
  for (const k of keys) delete process.env[k];
  process.env.LI_SKIP_DOTENV = "1";
  process.env.CURSOR_API_KEY = "https://cursor.com/dashboard/integrations";
  process.env.CURSOR_SDK_KEY = "key_test_01234567890123456789012";
  process.env.CURSOR_SDK = "https://cursor.com/dashboard/integrations";
  try {
    assert.equal(resolveCursorApiKey(), "key_test_01234567890123456789012");
  } finally {
    delete process.env.LI_SKIP_DOTENV;
    for (const k of keys) {
      if (prev[k] === undefined) delete process.env[k];
      else process.env[k] = prev[k];
    }
  }
});
