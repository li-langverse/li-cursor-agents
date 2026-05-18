/**
 * Native dashboard API: read routes hit Supabase via parent package dist.
 * POST/PATCH proxy to ops-server :9477.
 */
import { createRequire } from "node:module";
import { join } from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ path?: string[] }> };

function loadHandler(): Promise<typeof import("../../../../dist/dashboard-api/index.js")> {
  const repoRoot = join(process.cwd(), "..");
  const req = createRequire(join(repoRoot, "package.json"));
  return Promise.resolve(req("./dist/dashboard-api/index.js") as typeof import("../../../../dist/dashboard-api/index.js"));
}

async function dispatch(req: Request, ctx: RouteCtx): Promise<Response> {
  const { path } = await ctx.params;
  const apiPath = `/api/${(path ?? []).join("/")}`;
  const { handleDashboardRequest } = await loadHandler();
  return handleDashboardRequest(req, apiPath);
}

export async function GET(req: Request, ctx: RouteCtx) {
  return dispatch(req, ctx);
}

export async function POST(req: Request, ctx: RouteCtx) {
  return dispatch(req, ctx);
}

export async function PATCH(req: Request, ctx: RouteCtx) {
  return dispatch(req, ctx);
}

export async function OPTIONS(req: Request, ctx: RouteCtx) {
  return dispatch(req, ctx);
}
