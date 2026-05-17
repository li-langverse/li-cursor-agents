#!/usr/bin/env node
/**
 * Emit local Supabase JWT keys for `supabase start` (HS256, JWT_SECRET from db container).
 * Usage: node scripts/lib/supabase-local-keys.mjs [jwt_secret]
 */
import crypto from "node:crypto";

const DEFAULT_SECRET = "super-secret-jwt-token-with-at-least-32-characters-long";
const secret = process.argv[2]?.trim() || process.env.JWT_SECRET?.trim() || DEFAULT_SECRET;
const exp = 1983812996;

function b64url(obj) {
  return Buffer.from(JSON.stringify(obj)).toString("base64url");
}

function signJwt(role) {
  const header = b64url({ alg: "HS256", typ: "JWT" });
  const payload = b64url({ iss: "supabase-demo", role, exp });
  const sig = crypto.createHmac("sha256", secret).update(`${header}.${payload}`).digest("base64url");
  return `${header}.${payload}.${sig}`;
}

const apiUrl = process.env.SUPABASE_URL?.trim() || "http://127.0.0.1:54321";
console.log(`SUPABASE_URL=${apiUrl}`);
console.log(`SUPABASE_ANON_KEY=${signJwt("anon")}`);
console.log(`SUPABASE_SERVICE_ROLE_KEY=${signJwt("service_role")}`);
