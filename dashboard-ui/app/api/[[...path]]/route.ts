/**
 * Read-only dashboard API: GET routes hit Supabase via parent dist/db-api.
 * Control POST/PATCH: use NEXT_PUBLIC_LI_WORKER_URL → ops-server :9477 (see dashboard-ui/lib/api.ts).
 */
import { createRequire } from "node:module";
import { join } from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ path?: string[] }> };

function loadHandler(): Promise<typeof import("../../../../dist/db-api/index.js")> {
  const repoRoot = join(process.cwd(), "..");
  const req = createRequire(join(repoRoot, "package.json"));
  return Promise.resolve(req("./dist/db-api/index.js") as typeof import("../../../../dist/db-api/index.js"));
}

async function dispatch(req: Request, ctx: RouteCtx): Promise<Response> {
  const { path } = await ctx.params;
  const apiPath = `/api/${(path ?? []).join("/")}`;
  const { handleDbApiRequest } = await loadHandler();
  return handleDbApiRequest(req, apiPath);
}

export async function GET(req: Request, ctx: RouteCtx) {
  return dispatch(req, ctx);
}

export async function OPTIONS(req: Request, ctx: RouteCtx) {
  return dispatch(req, ctx);
}
