import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join, extname } from "node:path";
import { dashboardRosterSummary } from "./agents/dashboard-roster.js";
import { sortedCoordinators } from "./heap/coordinators.js";
import { agentsPackageRoot } from "./runner.js";
import { interventionsPath, reportPath, statePath } from "./control-plane/paths.js";
import { loadState } from "./control-plane/state.js";
import { runPreflight, resolveBenchmarksRoot } from "./preflight.js";
import { supervisorTick } from "./supervisor/loop.js";

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
};

export function defaultOpsPort(): number {
  return Number(process.env.LI_AGENTS_OPS_PORT ?? process.env.LI_AGENT_DASHBOARD_PORT ?? 9477);
}

export function startOpsServer(port: number): ReturnType<typeof createServer> {
  const packageRoot = agentsPackageRoot();
  const webRoot = join(packageRoot, "web");

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      if (url.pathname.startsWith("/api/")) {
        await handleApi(url, req, res);
        return;
      }
      serveStatic(url.pathname, webRoot, res);
    } catch (err) {
      json(res, 500, { error: err instanceof Error ? err.message : String(err) });
    }
  });

  server.listen(port, "127.0.0.1", () => {
    const addr = server.address();
    const p = typeof addr === "object" && addr ? addr.port : port;
    if (port !== 0) {
      console.error(`Agent dashboard: http://127.0.0.1:${p}/`);
    }
  });
  return server;
}

async function handleApi(url: URL, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const state = loadState();
  const report = readJson(reportPath());
  const interventions = readJson(interventionsPath());

  switch (url.pathname) {
    case "/api/status":
    case "/api/state":
      json(res, 200, { state, state_path: statePath(), benchmarks_root: resolveBenchmarksRoot() });
      return;
    case "/api/interventions":
      json(res, 200, interventions ?? { interventions: [] });
      return;
    case "/api/report":
      json(res, 200, report ?? { error: "no report — run supervisor" });
      return;
    case "/api/queue":
      json(res, 200, {
        queue: [],
        briefing_hash: state.last_briefing_hash,
        completed: state.recent_tasks,
      });
      return;
    case "/api/agents":
      json(res, 200, dashboardRosterSummary());
      return;
    case "/api/coordinators":
      json(res, 200, { coordinators: sortedCoordinators() });
      return;
    case "/api/heap": {
      const hp = (report as Record<string, unknown> | null)?.heap_plan ?? null;
      const org = (report as Record<string, unknown> | null)?.org_roadmap ?? null;
      json(res, 200, { heap_plan: hp, org_roadmap: org });
      return;
    }
    case "/api/tick":
      if (req.method !== "POST") {
        json(res, 405, { error: "POST only" });
        return;
      }
      await supervisorTick({
        mock: process.env.CURSOR_MOCK === "1",
        once: true,
        force: true,
        intervalMs: 60_000,
        cooldownMs: Number(process.env.LI_AGENTS_COOLDOWN_MS ?? 1_800_000),
        maxTasksPerTick: 1,
        benchmarksRoot: resolveBenchmarksRoot(),
      });
      json(res, 200, { ok: true, state: loadState(), report: readJson(reportPath()) });
      return;
    default:
      json(res, 404, { error: "not found" });
  }
}

function readJson(path: string): unknown {
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8"));
}

function serveStatic(pathname: string, webRoot: string, res: ServerResponse): void {
  const file = pathname === "/" ? "/index.html" : pathname;
  if (file.includes("..")) {
    json(res, 400, { error: "bad path" });
    return;
  }
  const full = join(webRoot, file);
  if (!existsSync(full)) {
    json(res, 404, { error: "not found" });
    return;
  }
  res.writeHead(200, { "Content-Type": MIME[extname(full)] ?? "text/plain", "Cache-Control": "no-store" });
  res.end(readFileSync(full));
}

function json(res: ServerResponse, code: number, body: unknown): void {
  res.writeHead(code, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(JSON.stringify(body, null, 2));
}
