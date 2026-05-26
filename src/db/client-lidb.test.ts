import { test } from "node:test";
import assert from "node:assert/strict";
import {
  assertStoreReady,
  configuredStore,
  exportDiskCacheEnabled,
  lidbReady,
  useDiskBackedStore,
  useLidbStore,
} from "./client.js";

test("configuredStore accepts lidb", () => {
  const prev = process.env.LI_CONTROL_PLANE_STORE;
  process.env.LI_CONTROL_PLANE_STORE = "lidb";
  try {
    assert.equal(configuredStore(), "lidb");
    assert.equal(useLidbStore(), true);
    assert.equal(useDiskBackedStore(), true);
    assert.ok(exportDiskCacheEnabled());
  } finally {
    if (prev === undefined) delete process.env.LI_CONTROL_PLANE_STORE;
    else process.env.LI_CONTROL_PLANE_STORE = prev;
  }
});

test("assertStoreReady throws for lidb without readiness env", () => {
  const prevStore = process.env.LI_CONTROL_PLANE_STORE;
  const prevMock = process.env.LI_LIDB_MOCK;
  const prevUrl = process.env.LI_LIDB_URL;
  const prevData = process.env.LI_DATA_DIR;
  process.env.LI_CONTROL_PLANE_STORE = "lidb";
  delete process.env.LI_LIDB_MOCK;
  delete process.env.LI_LIDB_URL;
  delete process.env.LI_DATA_DIR;
  try {
    assert.equal(lidbReady(), false);
    assert.throws(() => assertStoreReady(), /LI_CONTROL_PLANE_STORE=lidb/);
  } finally {
    if (prevStore === undefined) delete process.env.LI_CONTROL_PLANE_STORE;
    else process.env.LI_CONTROL_PLANE_STORE = prevStore;
    if (prevMock === undefined) delete process.env.LI_LIDB_MOCK;
    else process.env.LI_LIDB_MOCK = prevMock;
    if (prevUrl === undefined) delete process.env.LI_LIDB_URL;
    else process.env.LI_LIDB_URL = prevUrl;
    if (prevData === undefined) delete process.env.LI_DATA_DIR;
    else process.env.LI_DATA_DIR = prevData;
  }
});
