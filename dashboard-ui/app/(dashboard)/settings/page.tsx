"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { apiFetch, apiPatch } from "@/lib/api";
import { invalidateDashboardQueries } from "@/lib/invalidate-dashboard";
import { Button } from "@/components/ui/button";

type SettingRow = {
  key: string;
  label: string;
  description: string;
  category: string;
  type: "number" | "boolean" | "string" | "enum";
  defaultValue: string;
  value: string;
  source: "ui" | "env" | "default";
  enumValues?: string[];
  min?: number;
  max?: number;
  restartRequired?: boolean;
};

type SettingsResponse = {
  categories: Array<{ id: string; label: string }>;
  settings: SettingRow[];
  restart_required: boolean;
  updated_at: string;
  secrets?: {
    github: { configured: boolean; path_hint: string };
    cursor_sdk: { configured: boolean };
  };
};

export default function SettingsPage() {
  const qc = useQueryClient();
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["settings"],
    queryFn: () => apiFetch<SettingsResponse>("/api/settings"),
  });

  const [draft, setDraft] = useState<Record<string, string>>({});
  const [toast, setToast] = useState<string | null>(null);

  const merged = useMemo(() => {
    if (!data?.settings) return [];
    return data.settings.map((s) => ({
      ...s,
      value: draft[s.key] ?? s.value,
    }));
  }, [data, draft]);

  const dirtyKeys = useMemo(
    () =>
      Object.keys(draft).filter(
        (k) => draft[k] !== data?.settings.find((s) => s.key === k)?.value,
      ),
    [draft, data],
  );

  const saveMut = useMutation({
    mutationFn: () => apiPatch<SettingsResponse>("/api/settings", { values: draft }),
    onSuccess: (body) => {
      setDraft({});
      setToast(
        body.restart_required
          ? "Saved. Restart dashboard / supervisor for port & store changes."
          : "Settings saved and applied to the running control plane.",
      );
      qc.setQueryData(["settings"], body);
      void invalidateDashboardQueries(qc);
    },
    onError: (e: Error) => setToast(e.message),
  });

  const resetMut = useMutation({
    mutationFn: (keys: string[]) => apiPatch<SettingsResponse>("/api/settings", { reset_keys: keys }),
    onSuccess: (body) => {
      setDraft((d) => {
        const next = { ...d };
        for (const k of Object.keys(next)) {
          if (body.settings.find((s) => s.key === k)?.source !== "ui") delete next[k];
        }
        return next;
      });
      setToast("Reset to env/default.");
      qc.setQueryData(["settings"], body);
    },
    onError: (e: Error) => setToast(e.message),
  });

  if (isLoading) return <p className="loading-block">Loading settings…</p>;
  if (isError) return <p className="error-block">{(error as Error).message}</p>;

  const byCategory = data!.categories.map((cat) => ({
    ...cat,
    rows: merged.filter((s) => s.category === cat.id),
  }));

  return (
    <section className="panel settings-panel">
      <header className="settings-header">
        <div>
          <h2>Runtime settings</h2>
          <p className="hint">
            Overrides persist in <code>data/control-plane/runtime-settings.json</code> and apply
            immediately. API keys stay in <code>li-cursor-agents/.env</code> and sibling{" "}
            <code>{data?.secrets?.github.path_hint ?? "../.env.github"}</code> (GitHub).
          </p>
          {data?.secrets ? (
            <p className="hint secrets-status">
              GitHub: {data.secrets.github.configured ? "configured" : "missing"} · Cursor SDK:{" "}
              {data.secrets.cursor_sdk.configured ? "configured" : "missing"}
            </p>
          ) : null}
        </div>
        <div className="settings-actions">
          {dirtyKeys.length > 0 ? (
            <Button
              variant="primary"
              size="sm"
              loading={saveMut.isPending}
              onClick={() => saveMut.mutate()}
            >
              Save {dirtyKeys.length} change{dirtyKeys.length === 1 ? "" : "s"}
            </Button>
          ) : null}
        </div>
      </header>

      {toast ? (
        <p className="footer-toast" role="status">
          {toast}
        </p>
      ) : null}

      {data?.restart_required ? (
        <p className="hint warn-hint">Some saved settings require restarting the ops server.</p>
      ) : null}

      {byCategory.map((group) =>
        group.rows.length === 0 ? null : (
          <details key={group.id} className="settings-group" open={group.id === "supervisor"}>
            <summary>{group.label}</summary>
            <div className="settings-grid">
              {group.rows.map((row) => (
                <label key={row.key} className="settings-row">
                  <span className="settings-label">
                    {row.label}
                    <span className={`source-badge source-${row.source}`}>{row.source}</span>
                    {row.restartRequired ? (
                      <span className="source-badge source-restart">restart</span>
                    ) : null}
                  </span>
                  <span className="settings-desc">{row.description}</span>
                  <div className="settings-control">
                    {row.type === "boolean" ? (
                      <select
                        value={row.value === "1" ? "1" : "0"}
                        onChange={(e) =>
                          setDraft((d) => ({ ...d, [row.key]: e.target.value }))
                        }
                      >
                        <option value="0">Off (0)</option>
                        <option value="1">On (1)</option>
                      </select>
                    ) : row.type === "enum" ? (
                      <select
                        value={row.value}
                        onChange={(e) =>
                          setDraft((d) => ({ ...d, [row.key]: e.target.value }))
                        }
                      >
                        {(row.enumValues ?? []).map((v) => (
                          <option key={v || "__empty"} value={v}>
                            {v === "" ? "(empty)" : v}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type={row.type === "number" ? "number" : "text"}
                        value={row.value}
                        min={row.min}
                        max={row.max}
                        onChange={(e) =>
                          setDraft((d) => ({ ...d, [row.key]: e.target.value }))
                        }
                      />
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      type="button"
                      onClick={() =>
                        setDraft((d) => ({ ...d, [row.key]: row.defaultValue }))
                      }
                      title="Set to default in form"
                    >
                      Default
                    </Button>
                    {row.source === "ui" ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        type="button"
                        loading={resetMut.isPending}
                        onClick={() => resetMut.mutate([row.key])}
                      >
                        Clear UI
                      </Button>
                    ) : null}
                  </div>
                  <code className="settings-key">{row.key}</code>
                </label>
              ))}
            </div>
          </details>
        ),
      )}
    </section>
  );
}
