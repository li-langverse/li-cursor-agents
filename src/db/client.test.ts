import { test } from "node:test";
import assert from "node:assert/strict";
import {
  assertStoreReady,
  configuredStore,
  exportDiskCacheEnabled,
  lidbStoreReady,
  useLidbStore,
} from "./client.js";

test("configuredStore accepts lidb", () => {
  process.env.LI_CONTROL_PLANE_STORE = "lidb";
  delete process.env.LI_STACK_SKIP_SUPABASE;
  assert.equal(configuredStore(), "lidb");
  assert.equal(useLidbStore(), true);
  delete process.env.LI_CONTROL_PLANE_STORE;
});

test("lidbStoreReady with LI_LIDB_MOCK=1", () => {
  delete process.env.LI_LIDB_URL;
  process.env.LI_LIDB_MOCK = "1";
  assert.equal(lidbStoreReady(), true);
  delete process.env.LI_LIDB_MOCK;
});

test("assertStoreReady passes for lidb mock stub", () => {
  process.env.LI_CONTROL_PLANE_STORE = "lidb";
  process.env.LI_LIDB_MOCK = "1";
  delete process.env.LI_LIDB_URL;
  assert.doesNotThrow(() => assertStoreReady());
  delete process.env.LI_CONTROL_PLANE_STORE;
  delete process.env.LI_LIDB_MOCK;
});

test("assertStoreReady throws for lidb without URL or mock", () => {
  process.env.LI_CONTROL_PLANE_STORE = "lidb";
  delete process.env.LI_LIDB_URL;
  delete process.env.LI_LIDB_MOCK;
  assert.throws(() => assertStoreReady(), /LI_LIDB_URL/);
  delete process.env.LI_CONTROL_PLANE_STORE;
});

test("exportDiskCacheEnabled is always true for lidb store", () => {
  process.env.LI_CONTROL_PLANE_STORE = "lidb";
  assert.equal(exportDiskCacheEnabled(), true);
  delete process.env.LI_CONTROL_PLANE_STORE;
});
