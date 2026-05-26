import assert from "node:assert/strict";
import test from "node:test";
import {
  activeSupabaseEndpoint,
  parseSupabaseProbeStdout,
  supabaseFailoverEnabled,
} from "./supabase-failover.js";

test("parseSupabaseProbeStdout extracts probe lines only", () => {
  const vars = parseSupabaseProbeStdout(`
SUPABASE_URL=http://127.0.0.1:54421
SUPABASE_ANON_KEY=eyJhbG
SUPABASE_SERVICE_ROLE_KEY=eyJzci
SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54422/postgres
LI_SUPABASE_ACTIVE_ENDPOINT=standby
IGNORED=secret
`);
  assert.equal(vars.SUPABASE_URL, "http://127.0.0.1:54421");
  assert.equal(vars.LI_SUPABASE_ACTIVE_ENDPOINT, "standby");
  assert.equal(vars.IGNORED, undefined);
});

test("activeSupabaseEndpoint reads LI_SUPABASE_ACTIVE_ENDPOINT", () => {
  const prev = process.env.LI_SUPABASE_ACTIVE_ENDPOINT;
  process.env.LI_SUPABASE_ACTIVE_ENDPOINT = "primary";
  assert.equal(activeSupabaseEndpoint(), "primary");
  if (prev === undefined) delete process.env.LI_SUPABASE_ACTIVE_ENDPOINT;
  else process.env.LI_SUPABASE_ACTIVE_ENDPOINT = prev;
});

test("supabaseFailoverEnabled requires LI_SUPABASE_FAILOVER=1", () => {
  const prev = process.env.LI_SUPABASE_FAILOVER;
  process.env.LI_SUPABASE_FAILOVER = "1";
  assert.equal(supabaseFailoverEnabled(), true);
  delete process.env.LI_SUPABASE_FAILOVER;
  assert.equal(supabaseFailoverEnabled(), false);
  if (prev !== undefined) process.env.LI_SUPABASE_FAILOVER = prev;
});
