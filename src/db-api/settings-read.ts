import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { controlPlaneRoot } from "../control-plane/paths.js";
import { SETTINGS_SCHEMA, SETTING_CATEGORIES, type SettingDefinition } from "../config/settings-schema.js";
import type { SettingView, SettingsPayload, SecretsStatus } from "../config/runtime-settings.js";
import { dbEnabled } from "../db/client.js";
import { loadRuntimeSettingsFromDb } from "../db/runtime-settings-db.js";

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

async function loadPersistedForRead(): Promise<Record<string, string>> {
  if (dbEnabled()) {
    try {
      const fromDb = await loadRuntimeSettingsFromDb();
      if (Object.keys(fromDb).length > 0) return fromDb;
    } catch {
      /* disk fallback */
    }
  }
  const path = join(controlPlaneRoot(), "runtime-settings.json");
  if (!existsSync(path)) return {};
  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as { values?: Record<string, string> };
    return raw.values ?? {};
  } catch {
    return {};
  }
}

function resolveCurrentValue(
  def: SettingDefinition,
  persisted: Record<string, string>,
): { value: string; source: SettingView["source"] } {
  if (def.key in persisted) {
    return { value: persisted[def.key], source: "ui" };
  }
  const fromEnv = process.env[def.key]?.trim();
  if (fromEnv) return { value: fromEnv, source: "env" };
  return { value: def.defaultValue, source: "default" };
}

export async function listSettingsViewsForRead(): Promise<SettingsPayload> {
  const persisted = await loadPersistedForRead();
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

export { SETTING_CATEGORIES };
