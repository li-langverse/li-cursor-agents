import { createServer } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildPayload } from "./data.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** ConfigMap mounts resolve import.meta.url under server/..data/; dist lives beside server/. */
function resolveDistDir(moduleDir) {
  const fromEnv = process.env.ORG_SUPERVISOR_DASHBOARD_DIST_DIR?.trim();
  if (fromEnv && existsSync(join(fromEnv, "index.html"))) return fromEnv;
  const candidates = [
    join(moduleDir, "..", "..", "dist"),
    join(moduleDir, "..", "dist"),
  ];
  for (const dir of candidates) {
    if (existsSync(join(dir, "index.html"))) return dir;
  }
  return join(moduleDir, "..", "..", "dist");
}

const DIST_DIR = resolveDistDir(__dirname);

const port = Number(process.env.ORG_SUPERVISOR_DASHBOARD_API_PORT || 9478);
const host = process.env.ORG_SUPERVISOR_DASHBOARD_HOST || "127.0.0.1";
const serveStatic = process.argv.includes("--serve-static");

let cache = null;
let cacheAt = 0;
const CACHE_MS = 5_000;

async function getPayload(force = false) {
  if (!force && cache && Date.now() - cacheAt < CACHE_MS) return cache;
  cache = await buildPayload();
  cacheAt = Date.now();
  return cache;
}

function sendJson(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(JSON.stringify(body));
}

function sendText(res, status, body, type = "text/plain") {
  res.writeHead(status, { "Content-Type": type });
  res.end(body);
}

function staticFile(pathname) {
  let rel = pathname.replace(/\.\./g, "").replace(/^\/+/, "");
  if (!rel) rel = "index.html";
  const file = join(DIST_DIR, rel);
  if (!existsSync(file)) return null;
  const ext = file.split(".").pop() || "";
  const types = {
    html: "text/html",
    js: "application/javascript",
    css: "text/css",
    svg: "image/svg+xml",
    json: "application/json",
  };
  return { body: readFileSync(file), type: types[ext] || "application/octet-stream" };
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${host}`);

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    res.end();
    return;
  }

  if (url.pathname === "/api/health") {
    sendJson(res, 200, { ok: true });
    return;
  }

  if (url.pathname === "/api/org-supervisors") {
    try {
      const force = url.searchParams.get("refresh") === "1";
      const payload = await getPayload(force);
      sendJson(res, 200, payload);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      sendJson(res, 500, { error: message });
    }
    return;
  }

  if (serveStatic) {
    const asset = staticFile(url.pathname);
    if (asset) {
      sendText(res, 200, asset.body, asset.type);
      return;
    }
    const index = staticFile("/index.html");
    if (index) {
      sendText(res, 200, index.body, index.type);
      return;
    }
  }

  sendJson(res, 404, { error: "not found" });
});

server.listen(port, host, () => {
  console.log(
    `org-supervisor-dashboard API http://${host}:${port} (static=${serveStatic} dist=${DIST_DIR})`,
  );
});
