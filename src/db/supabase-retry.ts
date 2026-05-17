import { resetSupabaseClient } from "./client.js";

const TRANSIENT_RE =
  /fetch failed|ECONNREFUSED|ECONNRESET|ETIMEDOUT|ENOTFOUND|socket hang up|network|Failed to fetch|UND_ERR_CONNECT_TIMEOUT/i;

export function isTransientSupabaseError(err: unknown): boolean {
  if (!err) return false;
  const msg = err instanceof Error ? err.message : String(err);
  if (TRANSIENT_RE.test(msg)) return true;
  const cause = err instanceof Error && "cause" in err ? (err as Error & { cause?: unknown }).cause : undefined;
  if (cause) return isTransientSupabaseError(cause);
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withSupabaseRetry<T>(
  op: string,
  fn: () => Promise<T>,
  options?: { attempts?: number; baseDelayMs?: number },
): Promise<T> {
  const attempts = options?.attempts ?? Number(process.env.LI_SUPABASE_RETRY_ATTEMPTS ?? 4);
  const baseDelayMs = options?.baseDelayMs ?? Number(process.env.LI_SUPABASE_RETRY_BASE_MS ?? 200);
  let last: unknown;

  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      last = err;
      const transient = isTransientSupabaseError(err);
      if (!transient || i === attempts - 1) {
        throw err instanceof Error ? err : new Error(`${op}: ${String(err)}`);
      }
      resetSupabaseClient();
      await sleep(baseDelayMs * 2 ** i);
    }
  }

  throw last instanceof Error ? last : new Error(`${op}: ${String(last)}`);
}
