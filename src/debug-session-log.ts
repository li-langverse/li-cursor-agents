import { workerConsole } from "./worker/worker-console.js";

/** Debug-mode NDJSON ingest (session 898ce1). Remove after work-pickup issue verified. */
export function debugSessionLog(
  hypothesisId: string,
  location: string,
  message: string,
  data: Record<string, unknown> = {},
): void {
  workerConsole("debug", "info", `${hypothesisId} ${message}`, JSON.stringify(data));
  // #region agent log
  fetch("http://127.0.0.1:7746/ingest/994bad2f-5ad5-4c20-9cd2-19e851fc1d5c", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "898ce1" },
    body: JSON.stringify({
      sessionId: "898ce1",
      hypothesisId,
      location,
      message,
      data,
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion
}
