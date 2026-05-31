import type { PostgrestError } from "@supabase/supabase-js";

/** PostgREST often returns errors without `.message` when the table is missing from schema cache. */
export function formatSupabaseError(error: PostgrestError | null | undefined): string {
  if (!error) return "unknown";
  const parts: string[] = [];
  if (error.message) parts.push(error.message);
  if (error.code) parts.push(`code=${error.code}`);
  if (error.details) parts.push(`details=${error.details}`);
  if (error.hint) parts.push(`hint=${error.hint}`);
  if (parts.length) return parts.join(" | ");
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

export function supabaseError(prefix: string, error: PostgrestError | null | undefined): Error {
  return new Error(`${prefix}: ${formatSupabaseError(error)}`);
}
