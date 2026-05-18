/**
 * Native dashboard API: read routes hit Supabase via @li-langverse/cursor-agents (dist).
 * POST/PATCH (spawn agents, lanes, briefing refresh) proxy to ops-server :9477.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ path?: string[] }> };

async function dispatch(req: Request, ctx: RouteCtx): Promise<Response> {
  const { path } = await ctx.params;
  const apiPath = `/api/${(path ?? []).join("/")}`;
  const { handleDashboardRequest } = await import("../../../../dist/dashboard-api/index.js");
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
