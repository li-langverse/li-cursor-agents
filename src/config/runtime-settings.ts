import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { controlPlaneRoot } from "../control-plane/paths.js";
import {
  getSettingDefinition,
  SETTINGS_SCHEMA,
  type SettingDefinition,
} from "./settings-schema.js";

export interface SettingView {
  key: string;
  label: string;
  description: string;
  category: SettingDefinition["category"];
  type: SettingDefinition["type"];
  defaultValue: string;
  value: string;
  source: "ui" | "env" | "default";
  enumValues?: string[];
  min?: number;
  max?: number;
  secret?: boolean;
  restartRequired?: boolean;
}

export interface SecretsStatus {
  github: { configured: boolean; path_hint: string };
  cursor_sdk: { configured: boolean };
}

export interface SettingsPayload {
  updated_at: string;
  settings: SettingView[];
  restart_required: boolean;
  secrets: SecretsStatus;
}

function secretsStatus(): SecretsStatus {
  const pkgHint = process.env.LI_GITHUB_ENV?.trim() || "../.env.github";
  return {
    github: {
      configured: Boolean(process.env.GH_TOKEN?.trim() || process.env.GITHUB_TOKEN?.trim()),
      path_hint: pkgHint,
    },
    cursor_sdk: {
      configured: Boolean(
        process.env.CURSOR_API_KEY?.trim() ||
          process.env.CURSOR_SDK_KEY?.trim() ||
          process.env.CURSOR_SDK?.trim(),
      ),
    },
  };
}

function settingsPath(): string {
  return join(controlPlaneRoot(), "runtime-settings.json");
}

export function loadPersistedSettings(): Record<string, string> {
  const path = settingsPath();
  if (!existsSync(path)) return {};
  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as { values?: Record<string, string> };
    return raw.values ?? {};
  } catch {
    return {};
  }
}

function savePersistedSettings(values: Record<string, string>): void {
  const path = settingsPath();
  mkdirSync(controlPlaneRoot(), { recursive: true });
  writeFileSync(
    path,
    JSON.stringify({ version: 1, updated_at: new Date().toISOString(), values }, null, 2),
    "utf8",
  );
}

function envValueForKey(key: string): string | undefined {
  const v = process.env[key]?.trim();
  return v === "" ? undefined : v;
}

function resolveCurrentValue(
  def: SettingDefinition,
  persisted: Record<string, string>,
): { value: string; source: SettingView["source"] } {
  if (def.key in persisted) {
    return { value: persisted[def.key], source: "ui" };
  }
  const fromEnv = envValueForKey(def.key);
  if (fromEnv !== undefined) {
    return { value: fromEnv, source: "env" };
  }
  return { value: def.defaultValue, source: "default" };
}

export function listSettingsViews(): SettingsPayload {
  const persisted = loadPersistedSettings();
  let restartRequired = false;
  const settings: SettingView[] = SETTINGS_SCHEMA.map((def) => {
    const { value, source } = resolveCurrentValue(def, persisted);
    if (source === "ui" && def.restartRequired) restartRequired = true;
    return {
      key: def.key,
      label: def.label,
      description: def.description,
      category: def.category,
      type: def.type,
      defaultValue: def.defaultValue,
      value,
      source,
      enumValues: def.enumValues,
      min: def.min,
      max: def.max,
      secret: def.secret,
      restartRequired: def.restartRequired,
    };
  });
  return {
    updated_at: new Date().toISOString(),
    settings,
    restart_required: restartRequired,
    secrets: secretsStatus(),
  };
}

function normalizeBooleanInput(raw: string): string {
  const lower = raw.trim().toLowerCase();
  if (lower === "1" || lower === "true" || lower === "yes") return "1";
  if (lower === "0" || lower === "false" || lower === "no") return "0";
  throw new Error(`Invalid boolean value: ${raw}`);
}

export function validateSettingValue(def: SettingDefinition, raw: string): string {
  const trimmed = raw.trim();
  if (def.type === "boolean") return normalizeBooleanInput(trimmed);
  if (def.type === "enum") {
    const allowed = def.enumValues ?? [];
    if (trimmed === "" && allowed.includes("")) return "";
    if (!allowed.includes(trimmed)) {
      throw new Error(`Value must be one of: ${allowed.join(", ")}`);
    }
    return trimmed;
  }
  if (def.type === "number") {
    const n = Number(trimmed);
    if (!Number.isFinite(n)) throw new Error("Expected a number");
    if (def.min !== undefined && n < def.min) throw new Error(`Minimum is ${def.min}`);
    if (def.max !== undefined && n > def.max) throw new Error(`Maximum is ${def.max}`);
    return String(Math.trunc(n) === n ? n : n);
  }
  return trimmed;
}

export function applySettingToEnv(key: string, value: string): void {
  const def = getSettingDefinition(key);
  if (!def) return;
  const normalized = validateSettingValue(def, value);
  if (normalized === "" && def.type !== "enum") {
    delete process.env[key];
  } else {
    process.env[key] = normalized;
  }
  for (const alias of def.aliases ?? []) {
    if (normalized === "") delete process.env[alias];
    else process.env[alias] = normalized;
  }
  if (key === "LI_CONTROL_PLANE_STORE") {
    process.env.LI_STACK_SKIP_SUPABASE = normalized === "disk" ? "1" : "0";
  }
  if (key === "LI_STACK_SKIP_SUPABASE") {
    if (normalized === "1") process.env.LI_CONTROL_PLANE_STORE = "disk";
  }
}

export function applyAllPersistedSettings(): void {
  const persisted = loadPersistedSettings();
  for (const key of Object.keys(persisted)) {
    applySettingToEnv(key, persisted[key]);
  }
}

/** Call after .env load — UI overrides apply on top for keys saved in runtime-settings.json. */
export function loadRuntimeSettings(): void {
  applyAllPersistedSettings();
}

export function patchSettings(
  patch: Record<string, string>,
  options?: { resetKeys?: string[] },
): SettingsPayload {
  const persisted = loadPersistedSettings();
  const errors: string[] = [];

  for (const key of options?.resetKeys ?? []) {
    const def = getSettingDefinition(key);
    if (!def) {
      errors.push(`Unknown key: ${key}`);
      continue;
    }
    delete persisted[key];
    delete process.env[key];
    for (const alias of def.aliases ?? []) delete process.env[alias];
  }

  for (const [key, raw] of Object.entries(patch)) {
    const def = getSettingDefinition(key);
    if (!def) {
      errors.push(`Unknown key: ${key}`);
      continue;
    }
    try {
      const normalized = validateSettingValue(def, raw);
      persisted[key] = normalized;
      applySettingToEnv(key, normalized);
    } catch (e) {
      errors.push(`${key}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  if (errors.length > 0) {
    throw new Error(errors.join("; "));
  }

  savePersistedSettings(persisted);
  return listSettingsViews();
}
