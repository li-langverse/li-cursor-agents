import type { RuntimePayload, StatusPayload } from "./types";

/** Map /api/status JSON (runtime + top-level fields) into dashboard StatusPayload. */
export function parseStatusResponse(raw: Record<string, unknown> | undefined): StatusPayload {
  if (!raw || typeof raw !== "object") return {};
  const runtime = raw.runtime as RuntimePayload | undefined;
  const mergedRuntime: RuntimePayload | undefined = runtime
    ? {
        ...runtime,
        async_swarm_running:
          runtime.async_swarm_running ?? Boolean(raw.async_swarm_running),
        store: runtime.store ?? (typeof raw.store === "string" ? raw.store : undefined),
        agent_backend:
          runtime.agent_backend ??
          (typeof raw.agent_backend === "string" ? raw.agent_backend : undefined),
      }
    : undefined;
  return {
    runtime: mergedRuntime,
    sdk_ready: typeof raw.sdk_ready === "boolean" ? raw.sdk_ready : undefined,
    agent_backend: typeof raw.agent_backend === "string" ? raw.agent_backend : undefined,
  };
}
