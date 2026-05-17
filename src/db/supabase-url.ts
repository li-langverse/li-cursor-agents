/** Normalize local API URL (localhost → 127.0.0.1 avoids macOS IPv6 fetch failures). */
export function normalizeSupabaseApiUrl(url: string): string {
  try {
    const u = new URL(url.trim());
    if (u.hostname === "localhost") u.hostname = "127.0.0.1";
    return u.toString().replace(/\/$/, "");
  } catch {
    return url.trim().replace(/\/$/, "");
  }
}
