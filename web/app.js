const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const ui = {
  view: "overview",
  agentFilter: "all",
  agentSearch: "",
  selectedAgentId: null,
  selectedRunId: null,
  data: null,
  pollMs: 4000,
  toastTimer: null,
  /** @type {Set<string>} keys runId:section — survives poll re-renders */
  openDrilldowns: new Set(),
  /** @type {Set<string>} user explicitly collapsed (overrides defaults) */
  closedDrilldowns: new Set(),
  statsRange: "1d",
  statsCustomSince: "",
  statsCustomUntil: "",

};

function statisticsQueryString({ refresh = false } = {}) {
  const params = new URLSearchParams();
  params.set("range", ui.statsRange);
  if (ui.statsRange === "custom") {
    if (ui.statsCustomSince) params.set("since", ui.statsCustomSince);
    if (ui.statsCustomUntil) params.set("until", ui.statsCustomUntil);
  }
  if (refresh) params.set("refresh", "1");
  return params.toString();
}

async function loadStatistics() {
  if (!ui.data) ui.data = {};
  const qs = statisticsQueryString({ refresh: true });
  ui.data.statisticsPayload = await fetchJson(`/api/statistics?${qs}`).catch(() => ({ statistics: null }));
  renderSwarmStatistics();
}

const VIEW_META = {
  overview: { title: "Overview", subtitle: "Swarm status at a glance" },
  activity: {
    title: "Activity",
    subtitle: "Recent runs — prompts, outputs, and actions taken",
  },
  agents: { title: "Agents", subtitle: "Click a row for live status and run output" },
  heap: { title: "Heap plan", subtitle: "Coordinator routing and briefing queue" },
  statistics: {
    title: "Statistics",
    subtitle: "Swarm output metrics — actions, edits, PRs, packages",
  },
  interventions: { title: "Interventions", subtitle: "Human action required" },
};

async function fetchJson(path, options) {
  const res = await fetch(path, { cache: "no-store", ...options });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `${path} ${res.status}`);
  }
  return res.json();
}

function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escAttr(s) {
  return esc(s).replace(/"/g, "&quot;");
}

function formatTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  const now = Date.now();
  const diff = now - d.getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return d.toLocaleString();
}

function statusLabel(status) {
  const labels = {
    running: "Running",
    on_duty: "On duty",
    recommended: "Recommended",
    queued: "In queue",
    stopped: "Stopped",
    idle: "Idle",
    cooldown: "Cooldown",
    finished: "Finished",
    error: "Error",
    cancelled: "Cancelled",
    incomplete: "Incomplete",
  };
  return labels[status] ?? status;
}

function briefingGaps(report) {
  return (
    report?.agent_deliverable_gaps ??
    report?.preflight?.briefing?.agent_deliverable_gaps ??
    null
  );
}

function statusDot(status) {
  return `<span class="status-dot ${escAttr(status)}"></span>${esc(statusLabel(status))}`;
}

function runBackendLabel(run) {
  return run?.backend ?? run?.run_input?.backend ?? null;
}

function backendBadge(backend) {
  const b = backend ?? "cursor-sdk";
  const mock = b === "mock";
  return `<span class="backend-badge ${mock ? "mock" : "sdk"}">${esc(b)}</span>`;
}

function renderAgentBackendUi() {
  const status = ui.data?.status ?? {};
  const agentBackend = status.agent_backend ?? ui.data?.runtime?.agent_backend ?? "cursor-sdk";
  const sdkReady = Boolean(status.sdk_ready);

  const pill = $("#backend-pill");
  if (pill) {
    pill.textContent = agentBackend;
    pill.className = `backend-pill backend-badge ${agentBackend === "mock" ? "mock" : "sdk"}`;
    pill.title =
      agentBackend === "mock"
        ? "Mock backend — no real LLM, tools, or web search"
        : sdkReady
          ? "Cursor SDK — real agent runs (LLM + tools)"
          : "Cursor SDK selected but CURSOR_API_KEY missing";
  }

  const banner = $("#backend-banner");
  if (!banner) return;
  if (agentBackend === "mock") {
    banner.className = "backend-banner warn";
    banner.hidden = false;
    banner.innerHTML =
      "<strong>Mock mode</strong> — runs do not use the Cursor SDK or web search. Put <code>CURSOR_API_KEY</code> in <code>li-cursor-agents/.env</code> and restart the dashboard (<code>npm run agents:keep</code>).";
  } else if (!sdkReady) {
    banner.className = "backend-banner error";
    banner.hidden = false;
    banner.innerHTML =
      "<strong>Missing API key</strong> — add <code>CURSOR_API_KEY</code> to <code>li-cursor-agents/.env</code>, then restart the dashboard.";
  } else {
    banner.className = "backend-banner ok";
    banner.hidden = false;
    banner.innerHTML =
      "<strong>Cursor SDK active</strong> — click <strong>Start agents</strong> once; agents keep working in the background (no further clicks).";
  }
}

function agentStatusMap(roster, report, runtime, statusPayload) {
  const map = new Map();
  const activeRuns = runtime?.active_runs ?? [];
  const stopped = new Set(runtime?.stopped_agents ?? []);
  const currentSupervisor = runtime?.current_supervisor_agent ?? statusPayload?.state?.current_supervisor_agent;
  const handoffRun = runtime?.handoff_run ?? statusPayload?.handoff_run;
  const handoffPipeline = new Set(handoffRun?.pipeline_agents ?? []);
  const swarmWorkers = new Set(
    runtime?.worker_pool?.agents?.length
      ? runtime.worker_pool.agents
      : runtime?.worker_agent_ids ?? [],
  );
  const rec = new Map((report?.recommended_agents ?? []).map((r) => [r.agent, r.reason]));
  const heapTasks = new Map(
    (report?.heap_plan?.flat_tasks ?? []).map((t) => [t.agent, { reason: t.reason, coord: t.coordinator }]),
  );
  const recentByAgent = new Map();
  for (const t of statusPayload?.state?.recent_tasks ?? []) {
    if (!recentByAgent.has(t.agentId)) recentByAgent.set(t.agentId, t);
  }
  for (const r of report?.recent_runs ?? []) {
    if (!recentByAgent.has(r.agentId)) recentByAgent.set(r.agentId, r);
  }

  for (const entry of roster?.roster ?? []) {
    if (entry.role === "coordinator") continue;
    let status = "idle";
    const activeRun = activeRuns.find((r) => r.agent_id === entry.id && r.status === "running");
    if (stopped.has(entry.id)) status = "stopped";
    else if (activeRun || currentSupervisor === entry.id) status = "running";
    else if (handoffRun?.in_progress && handoffPipeline.has(entry.id)) status = "running";
    else if (handoffRun?.in_progress && swarmWorkers.has(entry.id)) status = "queued";
    else if (runtime?.async_swarm_running) {
      const last = recentByAgent.get(entry.id);
      const finishedAt = last?.finished_at ? new Date(last.finished_at).getTime() : 0;
      const onCooldown =
        last?.status === "finished" && finishedAt && Date.now() - finishedAt < 1_800_000;
      if (onCooldown) status = "cooldown";
      else if (activeRuns.some((r) => r.agent_id === entry.id && r.status === "running")) status = "running";
      else if (handoffRun?.in_progress && swarmWorkers.has(entry.id)) status = "queued";
      else status = "on_duty";
    } else {
      const last = recentByAgent.get(entry.id);
      const finishedAt = last?.finished_at ? new Date(last.finished_at).getTime() : 0;
      const onCooldown =
        last?.status === "finished" && finishedAt && Date.now() - finishedAt < 1_800_000;
      if (onCooldown) status = "cooldown";
      else if (rec.has(entry.id) || heapTasks.has(entry.id)) status = "recommended";
    }

    map.set(entry.id, {
      status,
      reason: rec.get(entry.id) ?? heapTasks.get(entry.id)?.reason,
      coordinator: entry.coordinator ?? heapTasks.get(entry.id)?.coord,
      lastRun: recentByAgent.get(entry.id),
      activeRun: activeRun ?? null,
      entry,
    });
  }
  return map;
}

async function loadDashboard() {
  const [report, status, roster, runsPayload, supervisorActivity, activityPayload, interventionsPayload, statisticsPayload, handoffsPayload, swarmBriefingPayload, workQueuePayload] =
    await Promise.all([
      fetchJson("/api/report").catch(() => ({})),
      fetchJson("/api/status").catch((e) => {
        console.warn("/api/status failed — agents list may be stale:", e.message);
        return { runtime: {}, error: e.message };
      }),
      fetchJson("/api/agents"),
      fetchJson("/api/runs").catch(() => ({ runs: [], active: [] })),
      fetchJson("/api/supervisor/activity").catch(() => ({ entries: [], loop_running: false })),
      fetchJson("/api/activity/recent?limit=25").catch(() => ({ items: [] })),
      fetchJson("/api/interventions").catch(() => ({ interventions: [] })),
      fetchJson(`/api/statistics?${statisticsQueryString()}`).catch(() => ({ statistics: null })),
      fetchJson("/api/handoffs?limit=30").catch(() => ({ handoffs: [] })),
      fetchJson("/api/swarm/briefing").catch(() => ({})),
      fetchJson("/api/queue").catch(() => ({ queue: [] })),
    ]);
  const runtime = status?.runtime ?? roster?.runtime;
  const lanes = status?.lanes ?? runtime?.lanes;
  ui.data = {
    report: { ...report, interventions: interventionsPayload.interventions ?? report.interventions },
    status,
    lanes,
    roster,
    runtime,
    runsPayload,
    supervisorActivity,
    activityPayload,
    interventionsPayload,
    statisticsPayload,
    handoffsPayload,
    swarmBriefingPayload,
    workQueuePayload,
  };
  return ui.data;
}

function swarmRunning() {
  return Boolean(ui.data?.runtime?.async_swarm_running);
}

function fmtNum(n) {
  if (n == null || Number.isNaN(n)) return "—";
  return Number(n).toLocaleString();
}

function renderSwarmStatistics() {
  const s = ui.data?.statisticsPayload?.statistics;
  const meta = $("#swarm-stats-meta");
  const cards = $("#swarm-stat-cards");
  const notesEl = $("#swarm-stats-notes");
  if (!cards) return;
  if (!s) {
    cards.innerHTML = '<p class="empty">Statistics unavailable — refresh briefing and ensure runs are logged.</p>';
    if (meta) meta.textContent = "No statistics yet.";
    if (notesEl) {
      notesEl.innerHTML = "";
      notesEl.classList.add("hidden");
    }
    return;
  }
  const runsNote = s.runs_scanned != null ? `${s.runs_scanned} runs in range` : "";
  const rangeNote = s.range_label ? `Window: ${s.range_label}` : "";
  const briefingNote = s.briefing_generated_at ? `Briefing ${s.briefing_generated_at}` : "";
  const generatedNote = s.generated_at ? `Updated ${formatTime(s.generated_at)}` : "";
  if (meta) {
    meta.textContent =
      [rangeNote, runsNote, briefingNote, generatedNote].filter(Boolean).join(" · ") || "Swarm output metrics.";
  }
  const items = [
    { label: "Actions taken", value: fmtNum(s.actions_taken), hint: "tool calls in traces", accent: true },
    { label: "File edits", value: fmtNum(s.file_edits), hint: "write/edit/delete in traces" },
    { label: "Lines added", value: fmtNum(s.lines_added), hint: "from SDK edit results" },
    { label: "Lines deleted", value: fmtNum(s.lines_deleted), hint: "from SDK edit results" },
    { label: "PRs opened", value: fmtNum(s.prs_opened), hint: "unique PR URLs in run outputs" },
    { label: "PRs open now", value: fmtNum(s.prs_open_now), hint: "latest briefing all_open" },
    {
      label: "Agent PRs open",
      value: fmtNum(s.agent_prs_open_now),
      hint: "agent-tagged PRs in deliverable gate",
    },
    { label: "PRs merged", value: fmtNum(s.prs_merged), hint: "agent merges (runs + gh + history)" },
    { label: "Packages created", value: fmtNum(s.packages_created), hint: "packages/* writes in traces" },
  ];
  cards.innerHTML = items
    .map(
      (it) => `
    <div class="stat-card${it.accent ? " accent" : ""}" title="${escAttr(it.hint)}">
      <div class="label">${esc(it.label)}</div>
      <div class="value">${esc(it.value)}</div>
    </div>`,
    )
    .join("");

  const notes = (s.notes ?? []).filter(Boolean);
  if (notesEl) {
    if (notes.length) {
      notesEl.classList.remove("hidden");
      notesEl.innerHTML = notes.map((n) => `<li>${esc(n)}</li>`).join("");
    } else {
      notesEl.classList.add("hidden");
      notesEl.innerHTML = "";
    }
  }
}

function drillKey(runId, section) {
  return `${runId}:${section}`;
}

function isDrillOpen(runId, section, defaultOpen = false) {
  const key = drillKey(runId, section);
  if (ui.closedDrilldowns.has(key)) return false;
  if (ui.openDrilldowns.has(key)) return true;
  return defaultOpen;
}

function captureOpenDrilldowns(root) {
  if (!root) return;
  for (const el of root.querySelectorAll("details[data-drill][open]")) {
    ui.openDrilldowns.add(el.getAttribute("data-drill"));
  }
}

function activityItemsFingerprint(items) {
  return items
    .map(
      (i) =>
        `${i.run_id}:${i.status}:${i.live ? 1 : 0}:${i.run_trace?.steps?.length ?? 0}:${i.run_trace?.file_edits?.length ?? 0}:${(i.output_snippet ?? "").length}`,
    )
    .join("|");
}

function renderActionDrilldowns(item, { compact = false } = {}) {
  const runId = item.run_id ?? "unknown";
  const dk = (section) => escAttr(drillKey(runId, section));
  const openAttr = (section, defaultOpen = false) => (isDrillOpen(runId, section, defaultOpen) ? " open" : "");

  const input = item.run_input;
  const trace = item.run_trace;
  const edits = trace?.file_edits ?? [];
  const toolSteps = (trace?.steps ?? []).filter((s) => s.type === "toolCall");
  const outputText = trace?.assistant_text ?? item.output_snippet ?? item.output_preview ?? "";
  const thinking = trace?.thinking_text ?? item.thinking_preview ?? "";

  const inputBlock = input
    ? `${compact ? "" : `<details><summary>System prompt</summary><pre class="trace-pre">${esc(input.system_prompt)}</pre></details>`}
       <pre class="trace-pre">${esc(input.user_message)}</pre>`
    : `<p class="empty">No input recorded for this run.</p>`;

  const outputBlock = outputText
    ? `<pre class="trace-pre">${esc(outputText)}</pre>`
    : `<p class="empty">No assistant output recorded.</p>`;

  const actionsParts = [];
  if (edits.length) {
    actionsParts.push(`<h5>File edits (${edits.length})</h5><ul class="simple-list">${edits
      .map((f) => `<li><code>${esc(f.path)}</code> · ${esc(f.tool)}${f.ok === false ? " · failed" : ""}</li>`)
      .join("")}</ul>`);
  }
  if (toolSteps.length) {
    actionsParts.push(`<h5>Tool calls (${toolSteps.length})</h5><ul class="simple-list">${toolSteps
      .map((s) => {
        const m = s.message ?? {};
        const target = m.args?.path ?? m.args?.command ?? m.type ?? "tool";
        return `<li><code>${esc(m.type ?? "tool")}</code> ${esc(String(target).slice(0, 140))}</li>`;
      })
      .join("")}</ul>`);
  }
  const actionsBlock = actionsParts.length
    ? actionsParts.join("")
    : `<p class="empty">No file edits or tool calls recorded.</p>`;

  return `
    <div class="action-drilldowns">
      <details data-drill="${dk("input")}"${openAttr("input", Boolean(input && !compact))}>
        <summary>Input prompt</summary>
        ${input ? `<p class="trace-meta">${esc(input.backend)} · <code>${esc(input.cwd)}</code></p>` : ""}
        ${inputBlock}
      </details>
      ${
        thinking && !compact
          ? `<details data-drill="${dk("thinking")}"${openAttr("thinking")}><summary>Thinking</summary><pre class="trace-pre">${esc(thinking)}</pre></details>`
          : ""
      }
      <details data-drill="${dk("output")}"${openAttr("output")}>
        <summary>Output</summary>
        ${outputBlock}
      </details>
      <details data-drill="${dk("actions")}"${openAttr("actions")}>
        <summary>Actions taken</summary>
        ${actionsBlock}
      </details>
    </div>`;
}

function renderActivityCard(item, { compact = false } = {}) {
  const status = item.live ? "running" : item.status;
  const preview = item.prompt_preview || item.output_snippet || item.summary || "—";
  return `
    <article class="action-card ${compact ? "compact" : ""}" data-run-id="${escAttr(item.run_id)}">
      <header class="action-card-head">
        <div class="action-card-title">
          <code>${esc(item.agent_id)}</code>
          <span class="status-pill sm ${escAttr(status)}">${esc(statusLabel(status))}</span>
          <span class="time">${formatTime(item.started_at)}</span>
        </div>
        <span class="action-chips">${backendBadge(runBackendLabel(item))} ${esc(item.action_summary ?? "—")}</span>
      </header>
      ${compact ? `<p class="action-preview">${esc(preview)}</p>` : ""}
      ${renderActionDrilldowns(item, { compact })}
      <footer class="action-card-foot">
        <button type="button" class="btn ghost sm" data-open-run="${escAttr(item.run_id)}">Full trace →</button>
      </footer>
    </article>`;
}

function renderActionFeed(feed, items, { compact = false, emptyMessage } = {}) {
  if (!feed) return;
  if (!items.length) {
    feed.innerHTML = `<p class="empty">${emptyMessage}</p>`;
    delete feed.dataset.activityFp;
    return;
  }
  captureOpenDrilldowns(feed);
  const fp = activityItemsFingerprint(items);
  if (fp === feed.dataset.activityFp && feed.querySelector("[data-run-id]")) {
    return;
  }
  feed.dataset.activityFp = fp;
  feed.innerHTML = items.map((item) => renderActivityCard(item, { compact })).join("");
}

function renderActivityFeed() {
  const items = ui.data?.activityPayload?.items ?? [];
  renderActionFeed($("#activity-feed"), items, {
    emptyMessage: "No agent runs yet — start the supervisor or run an agent.",
  });
}

function renderOverviewActivityTeaser() {
  const items = (ui.data?.activityPayload?.items ?? []).slice(0, 4);
  renderActionFeed($("#overview-activity-feed"), items, {
    compact: true,
    emptyMessage: "No recorded runs with prompts or traces yet.",
  });
}

function showToast(message, kind = "info") {
  const el = $("#toast");
  if (!el) return;
  el.textContent = message;
  el.className = `toast toast-${kind}`;
  el.classList.remove("hidden");
  if (ui.toastTimer) clearTimeout(ui.toastTimer);
  ui.toastTimer = setTimeout(() => el.classList.add("hidden"), 8000);
}

function renderSidebar() {
  const { report, status, runtime, roster } = ui.data;
  const rt = runtime ?? {};
  const interventions = report?.interventions?.length ?? 0;
  const countEl = $("#nav-intervention-count");
  if (interventions > 0) {
    countEl.textContent = String(interventions);
    countEl.classList.remove("hidden");
  } else {
    countEl.classList.add("hidden");
  }

  const store = rt.store ?? status?.store ?? "disk";
  const agentBackend = status?.agent_backend ?? rt.agent_backend ?? "cursor-sdk";
  const sup = report?.supervisor ?? {};
  const st = status?.state ?? {};
  const swarmOn = Boolean(rt.async_swarm_running);
  const swarmStarted = rt.async_swarm_started_at;
  const loopOn = Boolean(rt.supervisor_loop_running);
  const loopStarted = rt.supervisor_loop_started_at ?? st.supervisor_loop_started_at;
  const qLen = ui.data?.workQueuePayload?.queue?.length ?? 0;
  $("#sidebar-stats").innerHTML = `
    <dl>
      <dt>Data store</dt><dd title="History in Supabase; live runs in this process">${esc(store)}</dd>
      <dt>Agent backend</dt><dd class="${agentBackend === "mock" ? "text-warn" : "text-ok"}">${esc(agentBackend)}</dd>
      <dt>Swarm</dt><dd class="${swarmOn ? "text-ok" : ""}">${swarmOn ? "● running" : "○ stopped"}</dd>
      <dt>Since</dt><dd>${swarmOn && swarmStarted ? formatTime(swarmStarted) : "—"}</dd>
      <dt>SDK slots</dt><dd>${rt.sdk_max_concurrent ?? "—"}</dd>
      <dt>Queue</dt><dd>${qLen} pending</dd>
      <dt>Running now</dt><dd>${rt.active_run_count ?? 0}</dd>
      <dt>Agents</dt><dd>${roster?.total ?? "—"}</dd>
      <dt>Briefing</dt><dd title="${escAttr(report?.briefing_hash ?? "")}">${esc((report?.briefing_hash ?? "—").slice(0, 12))}</dd>
    </dl>`;

  const pill = $("#status-pill");
  let label = "idle";
  if (swarmOn) label = "swarm on";
  else if (rt.current_supervisor_agent) label = `running ${rt.current_supervisor_agent}`;
  else if (loopOn) label = "supervisor on";
  else if ((rt.active_run_count ?? 0) > 0) label = "agents running";
  pill.textContent = label;
  pill.className = `pill ${label.includes("running") || label.includes("on") ? "running" : "idle"}`;

  const swarmPill = $("#swarm-pill");
  if (swarmPill) {
    if (swarmOn) {
      const duty = countAgentsByStatus("on_duty");
      const sdk = rt.active_run_count ?? 0;
      swarmPill.hidden = false;
      swarmPill.textContent = sdk > 0 ? `swarm · ${sdk} in SDK` : `swarm · ${duty} on duty`;
      swarmPill.className = "pill swarm-pill running";
      swarmPill.title = `Continuous swarm since ${formatTime(swarmStarted)}`;
    } else {
      swarmPill.hidden = false;
      swarmPill.textContent = "swarm off";
      swarmPill.className = "pill swarm-pill idle";
      swarmPill.title = "Click Start agents to run continuously";
    }
  }

  renderFooterControls();
}

function countAgentsByStatus(status) {
  const { roster, report, runtime, status: statusPayload } = ui.data ?? {};
  if (!roster) return 0;
  const map = agentStatusMap(roster, report, runtime, statusPayload);
  let n = 0;
  for (const v of map.values()) if (v.status === status) n++;
  return n;
}

function renderSwarmStatusUi() {
  const { runtime, roster, report, status } = ui.data ?? {};
  const banner = $("#swarm-status-banner");
  const strip = $("#swarm-agents-strip");
  const swarmOn = Boolean(runtime?.async_swarm_running);
  const statusMap = roster ? agentStatusMap(roster, report, runtime, status) : new Map();

  let onDuty = 0;
  let running = 0;
  let queued = 0;
  const stripAgents = [];
  for (const [id, info] of statusMap) {
    if (info.status === "on_duty") onDuty++;
    if (info.status === "running") {
      running++;
      stripAgents.push({ id, info, rank: 0 });
    } else if (info.status === "queued") {
      queued++;
      stripAgents.push({ id, info, rank: 1 });
    } else if (info.status === "on_duty") {
      stripAgents.push({ id, info, rank: 2 });
    }
  }
  stripAgents.sort((a, b) => a.rank - b.rank || a.id.localeCompare(b.id));

  if (banner) {
    if (swarmOn) {
      const sdk = runtime?.active_run_count ?? running;
      const lanes = runtime?.lanes ?? ui.data?.lanes ?? {};
      banner.hidden = false;
      banner.className = "swarm-status-banner active";
      banner.innerHTML = `<span class="swarm-status-pulse" aria-hidden="true"></span><strong>Agents running</strong> — ${onDuty} on duty · ${running} in SDK now · ${queued} queued · research ${lanes.research_lane_running ? "on" : "off"} · implement ${lanes.implement_lane_running ? "on" : "off"}`;
    } else {
      banner.hidden = true;
      banner.className = "swarm-status-banner hidden";
      banner.innerHTML = "";
    }
  }

  if (strip) {
    if (swarmOn && stripAgents.length) {
      strip.hidden = false;
      strip.innerHTML = stripAgents
        .slice(0, 24)
        .map(
          ({ id, info }) =>
            `<button type="button" class="swarm-agent-chip ${escAttr(info.status)}" data-open-agent="${escAttr(id)}" title="${escAttr(info.reason ?? info.entry?.description ?? "")}"><span class="status-dot ${escAttr(info.status)}"></span><span class="mono">${esc(id)}</span></button>`,
        )
        .join("");
    } else {
      strip.hidden = true;
      strip.innerHTML = "";
    }
  }
}

function renderFooterControls() {
  const { runtime, status } = ui.data ?? {};
  const swarmBtn = $("#mode-swarm");
  const sup = $("#mode-supervisor");
  const par = $("#mode-parallel");
  const swarmOn = swarmRunning();
  const loopOn = Boolean(runtime?.supervisor_loop_running);

  if (swarmBtn) {
    if (swarmOn) {
      swarmBtn.textContent = "Stop agents";
      swarmBtn.className = "btn danger sm active";
      swarmBtn.title = "Stop continuous swarm (all lanes and worker loops)";
    } else {
      swarmBtn.textContent = "Start agents";
      swarmBtn.className = "btn primary sm";
      swarmBtn.title =
        "Start continuous swarm: research + implement + maintenance + all agents (parallel SDK)";
    }
  }
  if (sup) {
    if (loopOn) {
      sup.textContent = "Stop supervisor";
      sup.className = "btn danger sm active";
    } else {
      sup.textContent = "Supervisor";
      sup.className = "btn ghost sm hidden-advanced";
    }
  }
  if (par) {
    const handoff = runtime?.handoff_run ?? status?.runtime?.handoff_run;
    const handoffOn = Boolean(handoff?.in_progress);
    par.disabled = handoffOn || !swarmOn;
    par.title = !swarmOn
      ? "Start agents first"
      : handoffOn
        ? `Handoff in progress — ${handoff.current_agent ?? "starting"}`
        : "One-shot research → placement → implement (optional)";
    par.textContent = handoffOn ? "Handoff running…" : "Run handoff once";
    par.className = handoffOn ? "btn ghost sm active" : "btn ghost sm";
  }
}

function renderSupervisorActivity() {
  const { supervisorActivity, runtime, status } = ui.data ?? {};
  const rt = runtime ?? {};
  const swarmOn = swarmRunning();
  const loopOn = Boolean(rt.supervisor_loop_running ?? supervisorActivity?.loop_running);
  const badge = $("#supervisor-loop-badge");
  const meta = $("#supervisor-loop-meta");
  const feed = $("#supervisor-activity");
  if (!feed) return;

  if (badge) {
    badge.classList.toggle("hidden", !swarmOn && !loopOn);
    badge.textContent = swarmOn ? "swarm on" : loopOn ? "supervisor" : "off";
  }
  if (meta) {
    const started = rt.async_swarm_started_at ?? rt.supervisor_loop_started_at ?? supervisorActivity?.started_at;
    const lanes = rt.lanes ?? ui.data?.lanes ?? {};
    if (swarmOn) {
      meta.textContent = `Agents running continuously since ${formatTime(started)} · research ${lanes.research_lane_running ? "on" : "off"} · implement ${lanes.implement_lane_running ? "on" : "off"} · maintenance ${lanes.maintenance_lane_running ? "on" : "off"}`;
    } else if (loopOn) {
      const lastTick = status?.state?.last_tick_at;
      meta.textContent = `Supervisor since ${formatTime(started)} · last tick ${lastTick ? formatTime(lastTick) : "pending…"}`;
    } else {
      meta.textContent =
        "Click Start agents — no further interaction needed. Agents poll the work queue and handoffs until you stop.";
    }
  }

  const entries = supervisorActivity?.entries ?? [];
  if (!entries.length) {
    feed.innerHTML = `<li class="empty">${swarmOn || loopOn ? "Waiting for swarm events…" : "Start agents to begin."}</li>`;
    return;
  }
  feed.innerHTML = entries
    .map((e) => {
      const cls = e.level === "error" ? "severity-p0" : e.level === "warn" ? "severity-p1" : "";
      return `<li class="${cls}"><span class="time">${formatTime(e.at)}</span> <span class="badge">${esc(e.level)}</span> ${esc(e.message)}</li>`;
    })
    .join("");
}

function renderStatCards() {
  const { report, runtime, roster, runsPayload, status } = ui.data;
  const statusMap = agentStatusMap(roster, report, runtime, status);
  let running = 0;
  let recommended = 0;
  let queued = 0;
  let stopped = 0;
  let idle = 0;
  let cooldown = 0;
  for (const v of statusMap.values()) {
    if (v.status === "running") running++;
    if (v.status === "queued") queued++;
    if (v.status === "recommended") recommended++;
    if (v.status === "stopped") stopped++;
    if (v.status === "idle") idle++;
    if (v.status === "cooldown") cooldown++;
  }
  const interventions = report?.interventions?.length ?? 0;
  const runs = runsPayload?.runs?.length ?? 0;
  const gaps = briefingGaps(report);
  const gapTotal =
    (gaps?.incomplete_runs ?? 0) +
    (gaps?.agent_prs_blocked ?? 0) +
    (gaps?.numerics_without_evidence ?? 0);

  $("#stat-cards").innerHTML = `
    <div class="stat-card accent"><div class="label">Running</div><div class="value">${running}</div></div>
    <div class="stat-card"><div class="label">Queued</div><div class="value">${queued}</div></div>
    <div class="stat-card"><div class="label">Stopped</div><div class="value">${stopped}</div></div>
    <div class="stat-card"><div class="label">Interventions</div><div class="value">${interventions}</div></div>
    <div class="stat-card"><div class="label">Run artifacts</div><div class="value">${runs}</div></div>`;
}

function liveEventPreview(events) {
  if (!events?.length) return "";
  const last = events[events.length - 1];
  const p = last?.payload;
  if (p && typeof p === "object" && p.message) return String(p.message).slice(0, 140);
  return last?.event_type?.replace(/_/g, " ") ?? "";
}

async function loadLiveActivityEvents() {
  const runtime = ui.data?.runtime;
  const active = (runtime?.active_runs ?? []).filter((r) => r.status === "running" && r.run_id);
  const byRun = {};
  const needFetch = [];
  for (const r of active) {
    if (r.recent_events?.length) {
      byRun[r.run_id] = r.recent_events;
    } else {
      needFetch.push(r);
    }
  }
  await Promise.all(
    needFetch.slice(0, 10).map(async (r) => {
      try {
        const body = await fetchJson(
          `/api/runs/${encodeURIComponent(r.run_id)}/events?limit=24`,
        );
        byRun[r.run_id] = body.events ?? [];
      } catch {
        byRun[r.run_id] = [];
      }
    }),
  );
  ui.data.liveEventsByRun = byRun;
}

function agentCategoryLabel(agentId) {
  const entry = ui.data?.roster?.roster?.find((e) => e.id === agentId);
  return entry?.category ? String(entry.category).replace(/_/g, " ") : "";
}

function renderLiveActivity() {
  const { report, runtime, runsPayload, liveEventsByRun } = ui.data;
  const feed = $("#live-activity");
  const items = [];
  const activeRunIds = new Set(
    (runtime?.active_runs ?? []).filter((r) => r.status === "running").map((r) => r.run_id),
  );

  for (const r of runtime?.active_runs ?? []) {
    if (r.status !== "running") continue;
    const evLine =
      liveEventPreview(liveEventsByRun?.[r.run_id]) ||
      (r.last_event?.message ? String(r.last_event.message).slice(0, 140) : "");
    const trace = r.run_trace;
    const toolHint =
      trace?.tool_call_count > 0
        ? `${trace.tool_call_count} tool${trace.tool_call_count === 1 ? "" : "s"}`
        : "";
    const lane = agentCategoryLabel(r.agent_id);
    const detail = evLine || toolHint || r.reason || "preflight / awaiting SDK";
    const meta = [lane, formatTime(r.started_at)].filter(Boolean).join(" · ");
    items.push({
      t: r.started_at,
      html: `<strong>${esc(r.agent_id)}</strong>${meta ? ` <span class="muted">${esc(meta)}</span>` : ""} <span class="mono">${esc(detail)}</span>${r.run_id ? ` <button type="button" class="linkish" data-open-run="${escAttr(r.run_id)}">trace</button>` : ""}`,
    });
  }
  for (const r of runsPayload?.runs?.slice(0, 8) ?? []) {
    if (activeRunIds.has(r.run_id)) continue;
    if (r.status !== "running" && r.status !== "finished") continue;
    const evLine = liveEventPreview(liveEventsByRun?.[r.run_id]);
    const detail = evLine || r.summary || r.status;
    items.push({
      t: r.started_at,
      html: `<strong>${esc(r.agent_id)}</strong> ${esc(r.status)} <span class="mono">${esc(String(detail).slice(0, 120))}</span> <span class="time">${formatTime(r.started_at)}</span>${r.run_id ? ` <button type="button" class="linkish" data-open-run="${escAttr(r.run_id)}">trace</button>` : ""}`,
    });
  }
  for (const i of (report?.interventions ?? []).slice(0, 3)) {
    items.push({
      t: i.created_at,
      html: `<span class="badge">${esc(i.severity)}</span> ${esc(i.title)}`,
    });
  }

  items.sort((a, b) => new Date(b.t || 0) - new Date(a.t || 0));

  if (!items.length) {
    feed.innerHTML = '<li class="empty">No live activity — start supervisor or an agent.</li>';
    return;
  }
  feed.innerHTML = items.map((x) => `<li>${x.html}</li>`).join("");
}

function renderQueue() {
  const el = $("#queue");
  const items = ui.data?.workQueuePayload?.queue ?? [];
  if (!items.length) {
    const rec = ui.data.report?.recommended_agents ?? [];
    if (!rec.length) {
      el.innerHTML = `<li class="empty">${swarmRunning() ? "Queue empty — agents will pick up new briefing tasks" : "Start agents to process the work queue"}</li>`;
      return;
    }
    el.innerHTML = rec
      .slice(0, 8)
      .map(
        (r) =>
          `<li><button type="button" class="linkish" data-open-agent="${escAttr(r.agent)}"><strong>${esc(r.agent)}</strong></button> — ${esc(r.reason)}</li>`,
      )
      .join("");
    return;
  }
  el.innerHTML = items
    .slice(0, 12)
    .map((item) => {
      const agent = item.agent_id ?? "?";
      const pri = item.priority != null ? ` [p${item.priority}]` : "";
      return `<li><button type="button" class="linkish" data-open-agent="${escAttr(agent)}"><strong>${esc(agent)}</strong></button>${pri} <span class="muted">${esc(item.source)}</span> — ${esc(item.reason)}</li>`;
    })
    .join("");
}

function renderRunsTable() {
  const { runsPayload } = ui.data;
  const tbody = $("#runs-table-body");
  const runs = runsPayload?.runs ?? [];
  if (!runs.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty">No runs yet</td></tr>';
    return;
  }
  tbody.innerHTML = runs
    .slice(0, 20)
    .map(
      (r) => `
    <tr data-open-run="${escAttr(r.run_id)}" data-agent="${escAttr(r.agent_id)}">
      <td class="mono">${esc(r.agent_id)}</td>
      <td>${statusDot(r.live ? "running" : r.status)}</td>
      <td>${backendBadge(runBackendLabel(r))}</td>
      <td>${esc(formatTime(r.started_at))}</td>
      <td class="preview">${esc((r.output_preview ?? "").replace(/\s+/g, " ").slice(0, 80))}</td>
    </tr>`,
    )
    .join("");
}

function renderAgentsTable() {
  const { roster, report, runtime, status } = ui.data;
  const statusMap = agentStatusMap(roster, report, runtime, status);
  const q = ui.agentSearch.trim().toLowerCase();
  const tbody = $("#agents-table-body");
  const rows = [];

  for (const [id, info] of statusMap) {
    if (ui.agentFilter !== "all" && info.status !== ui.agentFilter) continue;
    const e = info.entry;
    const hay = `${id} ${e.name} ${e.description} ${info.reason ?? ""}`.toLowerCase();
    if (q && !hay.includes(q)) continue;
    const last = info.lastRun;
    rows.push({ id, info, e });
  }

  rows.sort((a, b) => {
    const order = { running: 0, recommended: 1, queued: 1, cooldown: 2, idle: 3, stopped: 4 };
    return (order[a.info.status] ?? 9) - (order[b.info.status] ?? 9);
  });

  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty">No agents match filter</td></tr>';
    return;
  }

  tbody.innerHTML = rows
    .map(
      ({ id, info, e }) => `
    <tr data-agent-id="${escAttr(id)}" class="${ui.selectedAgentId === id ? "selected" : ""}">
      <td><span class="mono">${esc(id)}</span><br><span style="color:var(--muted);font-size:0.8rem">${esc(e.name)}</span></td>
      <td>${statusDot(info.status)}</td>
      <td class="mono">${esc(info.coordinator ?? "—")}</td>
      <td>${esc((info.reason ?? "—").slice(0, 72))}</td>
      <td>${
        info.status === "running"
          ? "now"
          : info.lastRun
            ? `${esc(statusLabel(info.lastRun.status ?? "finished"))} · ${formatTime(info.lastRun.finished_at ?? info.lastRun.started_at)}`
            : "—"
      }</td>
      <td><button type="button" class="btn ghost sm" data-open-agent="${escAttr(id)}">Details</button></td>
    </tr>`,
    )
    .join("");
}

function renderInterventions() {
  const ivPayload = ui.data.interventionsPayload ?? {};
  const report = ui.data.report;
  const items = ivPayload.interventions ?? report?.interventions ?? [];
  const list = $("#interventions");
  const briefingAt = ivPayload.briefing_generated_at ?? report?.briefing_generated_at;
  const liveAt = ivPayload.generated_at ?? report?.live_at;
  let staleNote = "";
  if (briefingAt) {
    staleNote = `<p class="hint">Interventions from briefing <strong>${esc(briefingAt)}</strong>${liveAt ? ` · recomputed ${formatTime(liveAt)}` : ""}. Merged/closed PRs are excluded.</p>`;
  }
  if (ivPayload.stale_warning || report?.stale_warning) {
    staleNote += `<p class="hint warn">${esc(ivPayload.stale_warning ?? report.stale_warning)}</p>`;
  }
  if (!items.length) {
    list.innerHTML = `${staleNote}<li class="empty">No interventions — automated agents can proceed.</li>`;
    return;
  }
  const sev = (i) => {
    const s = i.severity ?? "medium";
    if (s === "critical" || s === "P0") return "severity-p0";
    if (s === "high" || s === "P1") return "severity-p1";
    return "severity-p2";
  };
  list.innerHTML =
    staleNote +
    items
      .map(
        (i) => `
    <li class="intervention ${sev(i)}">
      <h4>${esc(i.title)}</h4>
      <p>${esc(i.detail)}</p>
      <p>${esc(i.action ?? "")}</p>
      ${(i.links ?? [])
        .map(
          (u) =>
            `<p><a href="${escAttr(u)}" target="_blank" rel="noopener">${esc(u)}</a> — open to confirm state (closed PRs drop off after briefing refresh)</p>`,
        )
        .join("")}
    </li>`,
      )
      .join("");
}

function renderHeap() {
  const { report, roster } = ui.data;
  const root = $("#heap-layers");
  const hp = report?.heap_plan;
  const fullTree = roster?.roster?.filter((r) => r.role === "coordinator") ?? [];
  const layersById = new Map((hp?.layers ?? []).map((l) => [l.coordinator, l]));

  if (!fullTree.length) {
    root.innerHTML = '<p class="empty">Run agent-briefing.py in benchmarks</p>';
    return;
  }

  root.innerHTML = fullTree
    .map((coord) => {
      const layer = layersById.get(coord.id);
      const briefingAgents = layer?.agents ?? [];
      const leaves = coord.manages ?? [];
      const rows = leaves
        .map((agentId) => {
          const inPlan = briefingAgents.find((a) => a.agent === agentId);
          return `<li>
            <button type="button" class="linkish" data-open-agent="${escAttr(agentId)}">${esc(agentId)}</button>
            ${inPlan ? ` — ${esc(inPlan.reason)}` : ' <span style="color:var(--muted)">standby</span>'}
          </li>`;
        })
        .join("");
      return `
      <div class="heap-layer">
        <h4>${esc(coord.name)} <code>${esc(coord.id)}</code></h4>
        <ul>${rows}</ul>
      </div>`;
    })
    .join("");

  const r = report?.org_roadmap;
  const el = $("#roadmap-meta");
  if (!r) {
    el.innerHTML = "";
    return;
  }
  el.innerHTML = [
    ["Pillars", (r.pillars ?? []).join(", ")],
    ["Current PH", r.current_ph ?? "—"],
    ["Open items", String(r.master_plan_open_items ?? "—")],
  ]
    .map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`)
    .join("");
}

function setView(name) {
  ui.view = name;
  const meta = VIEW_META[name] ?? VIEW_META.overview;
  $("#view-title").textContent = meta.title;
  $("#view-subtitle").textContent = meta.subtitle;
  $$(".nav-item").forEach((btn) => btn.classList.toggle("active", btn.dataset.view === name));
  $$(".view").forEach((v) => {
    const on = v.id === `view-${name}`;
    v.hidden = !on;
    v.classList.toggle("active", on);
  });
}

async function openAgentDrawer(agentId) {
  ui.selectedAgentId = agentId;
  const drawer = $("#agent-drawer");
  const backdrop = $("#backdrop");
  drawer.hidden = false;
  backdrop.hidden = false;
  $("#drawer-agent-body").innerHTML = '<p class="empty">Loading…</p>';

  try {
    const detail = await fetchJson(`/api/agents/${encodeURIComponent(agentId)}/detail`);
    renderAgentDrawer(detail);
    if (ui.view === "agents") renderAgentsTable();
  } catch (e) {
    $("#drawer-agent-body").innerHTML = `<p class="empty">${esc(e.message)}</p>`;
  }
}

function renderAgentDrawer(d) {
  const a = d.agent;
  $("#drawer-agent-header").innerHTML = `
    <div>
      <h2><code>${esc(a.id)}</code></h2>
      <p class="sub">${esc(a.name)} · ${statusDot(d.status)}</p>
    </div>`;

  const timeline = (d.history?.length ? d.history : d.runs) ?? [];
  const runsHtml = timeline
    .map((r) => {
      const status = r.live ? "running" : r.status;
      const premature = r.premature || r.completion?.premature;
      const prs = r.pr_urls?.length ? r.pr_urls : r.completion?.pr_urls;
      const summary = r.summary || r.output_preview?.slice(0, 120);
      return `
    <li class="run-timeline-item ${r.live ? "live" : ""} ${premature ? "premature" : ""}" data-open-run="${escAttr(r.run_id)}">
      <div class="run-timeline-row">
        <span class="run-timeline-dot ${escAttr(status)}"></span>
        <div class="run-timeline-body">
          <div class="run-timeline-head">
            <strong>${esc(statusLabel(status))}</strong>
            ${premature ? '<span class="badge warn">premature</span>' : ""}
            ${status === "incomplete" ? '<span class="badge warn">incomplete</span>' : ""}
            <span class="time">${formatTime(r.started_at)}</span>
          </div>
          ${summary ? `<p class="run-timeline-summary">${esc(summary)}</p>` : ""}
          ${r.reason ? `<p class="run-timeline-reason">${esc(r.reason)}</p>` : ""}
          ${
            prs?.length
              ? `<p class="run-timeline-prs">${prs.map((u) => `<a href="${escAttr(u)}" target="_blank" rel="noopener">PR</a>`).join(" · ")}</p>`
              : ""
          }
        </div>
      </div>
    </li>`;
    })
    .join("");

  const tasksHtml = (d.recent_tasks ?? [])
    .map(
      (t) =>
        `<li>${esc(formatTime(t.finished_at))} — ${esc(t.status)} <span class="mono">${esc(t.reason?.slice(0, 60) ?? "")}</span></li>`,
    )
    .join("");

  $("#drawer-agent-body").innerHTML = `
    <div class="drawer-section">
      <h3>Current task</h3>
      <div class="task-reason">${esc(d.recommended_reason ?? "Not in this briefing queue")}</div>
      ${d.heap_coordinator ? `<p style="margin-top:0.5rem;font-size:0.85rem;color:var(--muted)">Coordinator: <code>${esc(d.heap_coordinator)}</code></p>` : ""}
    </div>
    ${
      d.active_run
        ? `<div class="drawer-section"><h3>Live process</h3>
      <p>PID ${esc(d.active_run.pid)} · started ${formatTime(d.active_run.started_at)}</p>
      <button type="button" class="btn danger sm" data-kill-run="${escAttr(d.active_run.run_id)}">Kill process</button></div>`
        : ""
    }
    <div class="drawer-section">
      <h3>Controls</h3>
      <div class="drawer-actions">
        <button type="button" class="btn primary sm" data-action="start" data-agent="${escAttr(a.id)}">Start</button>
        <button type="button" class="btn danger sm" data-action="stop" data-agent="${escAttr(a.id)}">Stop</button>
        ${d.stopped ? `<button type="button" class="btn ghost sm" data-action="resume" data-agent="${escAttr(a.id)}">Resume</button>` : ""}
      </div>
    </div>
    <div class="drawer-section">
      <h3>Run history</h3>
      <ul class="run-list run-timeline">${runsHtml || '<li class="empty">No runs recorded</li>'}</ul>
    </div>
    ${
      tasksHtml
        ? `<div class="drawer-section"><h3>Supervisor history</h3><ul class="simple-list">${tasksHtml}</ul></div>`
        : ""
    }
    <div class="drawer-section">
      <h3>About</h3>
      <p style="font-size:0.88rem;color:var(--muted)">${esc(a.description)}</p>
      <p style="font-size:0.8rem;margin-top:0.5rem">Prompt: <code>prompts/${esc(a.promptFile)}</code></p>
      ${a.needsWeb ? '<span class="badge web">needs web search</span>' : ""}
    </div>`;
}

function renderRunTrace(detail) {
  const input = detail.run_input;
  const trace = detail.run_trace;
  const parts = [];

  if (input) {
    parts.push(`<section class="trace-section"><h4>Input</h4>
      <p class="trace-meta">Agent <code>${esc(input.agent_id)}</code> · ${esc(input.backend)} · cwd <code>${esc(input.cwd)}</code></p>
      <details open><summary>System prompt</summary><pre class="trace-pre">${esc(input.system_prompt)}</pre></details>
      <details open><summary>User message</summary><pre class="trace-pre">${esc(input.user_message)}</pre></details>
    </section>`);
  }

  if (trace) {
    if (trace.thinking_text) {
      parts.push(`<section class="trace-section"><h4>Thinking</h4><pre class="trace-pre">${esc(trace.thinking_text)}</pre></section>`);
    }
    if (trace.file_edits?.length) {
      parts.push(`<section class="trace-section"><h4>Files touched (${trace.file_edits.length})</h4><ul class="simple-list">
        ${trace.file_edits.map((f) => `<li><code>${esc(f.path)}</code> · ${esc(f.tool)}${f.ok === false ? " · failed" : ""}</li>`).join("")}
      </ul></section>`);
    }
    if (trace.steps?.length) {
      parts.push(`<section class="trace-section"><h4>Tool steps (${trace.tool_call_count ?? trace.steps.length})</h4>
        <ul class="simple-list">${trace.steps
          .filter((s) => s.type === "toolCall")
          .map((s) => {
            const m = s.message ?? {};
            const path = m.args?.path ?? m.args?.command ?? m.type;
            return `<li><code>${esc(m.type)}</code> ${esc(String(path).slice(0, 120))}</li>`;
          })
          .join("")}</ul></section>`);
    }
    parts.push(`<section class="trace-section"><h4>Assistant output</h4><pre class="trace-pre">${esc(trace.assistant_text ?? detail.output_preview ?? "")}</pre></section>`);
  } else {
    parts.push(`<section class="trace-section"><h4>Output</h4><pre class="trace-pre">${esc(detail.output_preview ?? "(empty)")}</pre></section>`);
  }

  const comp = detail.completion;
  if (comp) {
    parts.push(`<section class="trace-section"><h4>Completion audit</h4>
      <p>complete=${esc(String(comp.complete))} premature=${esc(String(comp.premature))}</p>
      ${comp.gaps?.length ? `<p>Gaps: ${esc(comp.gaps.join("; "))}</p>` : ""}
    </section>`);
  }
  if (detail.pr_urls?.length) {
    parts.push(`<section class="trace-section"><h4>PRs</h4><ul class="simple-list">
      ${detail.pr_urls.map((u) => `<li><a href="${escAttr(u)}" target="_blank" rel="noopener">${esc(u)}</a></li>`).join("")}
    </ul></section>`);
  }

  return parts.join("") || `<pre class="trace-pre">${esc(detail.output_preview ?? "(no trace recorded)")}</pre>`;
}

async function openRunDrawer(runId) {
  ui.selectedRunId = runId;
  const drawer = $("#run-drawer");
  drawer.hidden = false;
  $("#drawer-run-output").textContent = "Loading…";
  try {
    const detail = await fetchJson(`/api/runs/${encodeURIComponent(runId)}`);
    const runBackend = runBackendLabel(detail) ?? ui.data?.status?.agent_backend ?? "cursor-sdk";
    $("#drawer-run-header").innerHTML = `
      <div>
        <h2><code>${esc(detail.agent_id)}</code> ${backendBadge(runBackend)}</h2>
        <p class="sub">${esc(statusLabel(detail.live ? "running" : detail.status))} · ${formatTime(detail.started_at)}</p>
      </div>`;
    const traceHtml = renderRunTrace(detail);
    $("#drawer-run-output").innerHTML = traceHtml;
  } catch (e) {
    $("#drawer-run-output").textContent = e.message;
  }
}

function closeDrawers() {
  $("#agent-drawer").hidden = true;
  $("#run-drawer").hidden = true;
  $("#backdrop").hidden = true;
  ui.selectedAgentId = null;
  ui.selectedRunId = null;
  renderAgentsTable();
}

async function refresh() {
  try {
    await loadDashboard();
    await loadLiveActivityEvents().catch(() => {});
    renderSidebar();
    renderAgentBackendUi();
    renderSupervisorActivity();
    renderStatCards();
    renderSwarmStatistics();
    renderLiveActivity();
    renderQueue();
    renderRunsTable();
    renderOverviewActivityTeaser();
    renderActivityFeed();
    renderAgentsTable();
    renderInterventions();
    renderHeap();
    $("#updated").textContent = new Date().toLocaleTimeString();
    if (ui.selectedAgentId) {
      try {
        const detail = await fetchJson(`/api/agents/${encodeURIComponent(ui.selectedAgentId)}/detail`);
        renderAgentDrawer(detail);
      } catch {
        /* drawer may close */
      }
    }
  } catch (e) {
    $("#status-pill").textContent = "offline";
    console.error(e);
  }
}

async function postControl(path, button, { label } = {}) {
  if (button) button.disabled = true;
  const prevText = button?.textContent;
  if (button && label) button.textContent = `${label}…`;
  try {
    const body = await fetchJson(path, { method: "POST" });
    const msg =
      body.message ??
      (body.handoff_phases
        ? "Handoff phases complete — see Supervisor log"
        : body.started
          ? "Supervisor loop started"
          : body.stopped
            ? "Supervisor stopped"
            : "OK");
    const allSkipped =
      body.handoff_phases?.phases?.length > 0 &&
      body.handoff_phases.phases.every((p) => p.tick?.skipped);
    const handoffStarted = body.accepted === true && body.handoff_run?.in_progress;
    showToast(
      handoffStarted
        ? `${msg} — check Activity / Supervisor log`
        : msg,
      allSkipped ? "warn" : body.already_running ? "warn" : body.started === false && body.stopped === false ? "warn" : "ok",
    );
    ui.pollMs =
      handoffStarted ||
      body.runtime?.supervisor_loop_running ||
      body.runtime?.async_swarm_running ||
      body.handoff_run?.in_progress
        ? 1500
        : 4000;
    schedulePoll();
    await refresh();
  } catch (e) {
    showToast(e.message, "error");
    alert(e.message);
  } finally {
    if (button) {
      button.disabled = false;
      if (prevText) button.textContent = prevText;
    }
  }
}

async function agentAction(action, agentId) {
  const path =
    action === "start"
      ? `/api/agents/${agentId}/start`
      : action === "stop"
        ? `/api/agents/${agentId}/stop`
        : `/api/agents/${agentId}/resume`;
  await fetchJson(path, { method: "POST" });
  await refresh();
  if (ui.selectedAgentId === agentId) {
    const detail = await fetchJson(`/api/agents/${encodeURIComponent(agentId)}/detail`);
    renderAgentDrawer(detail);
  }
}

$$(".nav-item").forEach((btn) => {
  btn.addEventListener("click", () => setView(btn.dataset.view));
});

$$("#agent-filters .chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    $$("#agent-filters .chip").forEach((c) => c.classList.remove("active"));
    chip.classList.add("active");
    ui.agentFilter = chip.dataset.filter;
    renderAgentsTable();
  });
});

$("#agent-search").addEventListener("input", (ev) => {
  ui.agentSearch = ev.target.value;
  renderAgentsTable();
});

$("#goto-activity")?.addEventListener("click", () => setView("activity"));
$("#refresh").addEventListener("click", refresh);
$("#refresh-briefing").addEventListener("click", () =>
  postControl("/api/briefing/refresh", $("#refresh-briefing")),
);
$("#mode-swarm")?.addEventListener("click", async () => {
  const btn = $("#mode-swarm");
  if (swarmRunning()) {
    await postControl("/api/async-swarm/stop", btn, { label: "Stopping" });
    ui.pollMs = 4000;
    schedulePoll();
    return;
  }
  if (ui.data?.runtime?.supervisor_loop_running) {
    await fetchJson("/api/supervisor/stop", { method: "POST" }).catch(() => {});
  }
  await postControl("/api/async-swarm/start", btn, { label: "Starting" });
  ui.pollMs = 1500;
  schedulePoll();
});

$("#mode-supervisor")?.addEventListener("click", async () => {
  const loopOn = ui.data?.runtime?.supervisor_loop_running;
  const btn = $("#mode-supervisor");
  if (loopOn) {
    await postControl("/api/supervisor/stop", btn, { label: "Stopping" });
    return;
  }
  if (swarmRunning()) {
    await postControl("/api/async-swarm/stop", btn, { label: "Stopping swarm" });
  }
  try {
    await fetchJson("/api/swarm/stop-all", { method: "POST" });
  } catch {
    /* no parallel runs */
  }
  await postControl("/api/supervisor/start", btn, { label: "Starting" });
});

$("#mode-parallel")?.addEventListener("click", async () => {
  const btn = $("#mode-parallel");
  if (!swarmRunning()) {
    showToast("Start agents first", "warn");
    return;
  }
  ui.pollMs = 1500;
  schedulePoll();
  await postControl("/api/swarm/run-all", btn, { label: "Starting handoff" });
});

$("#backdrop").addEventListener("click", closeDrawers);
$$(".drawer-close").forEach((btn) => {
  btn.addEventListener("click", () => {
    if (btn.dataset.close === "run") $("#run-drawer").hidden = true;
    else closeDrawers();
  });
});

document.addEventListener(
  "toggle",
  (ev) => {
    const d = ev.target;
    if (!(d instanceof HTMLDetailsElement)) return;
    const key = d.getAttribute("data-drill");
    if (!key || !d.closest(".action-feed, .action-drilldowns")) return;
    if (d.open) {
      ui.openDrilldowns.add(key);
      ui.closedDrilldowns.delete(key);
    } else {
      ui.openDrilldowns.delete(key);
      ui.closedDrilldowns.add(key);
    }
  },
  true,
);

document.body.addEventListener("click", async (ev) => {
  const openAgent = ev.target.closest("[data-open-agent]");
  if (openAgent) {
    ev.preventDefault();
    await openAgentDrawer(openAgent.dataset.openAgent);
    return;
  }
  const openRun = ev.target.closest("[data-open-run]");
  if (openRun) {
    ev.preventDefault();
    await openRunDrawer(openRun.dataset.openRun);
    return;
  }
  const row = ev.target.closest("tr[data-agent-id]");
  if (row && !ev.target.closest("button")) {
    await openAgentDrawer(row.dataset.agentId);
    return;
  }
  const actionBtn = ev.target.closest("[data-action]");
  if (actionBtn?.dataset.agent) {
    try {
      await agentAction(actionBtn.dataset.action, actionBtn.dataset.agent);
    } catch (e) {
      alert(e.message);
    }
    return;
  }
  const kill = ev.target.closest("[data-kill-run]");
  if (kill) {
    await fetchJson(`/api/runs/${kill.dataset.killRun}/cancel`, { method: "POST" });
    await refresh();
  }
});

let pollHandle = null;
function schedulePoll() {
  if (pollHandle) clearInterval(pollHandle);
  pollHandle = setInterval(refresh, ui.pollMs);
}

setView("overview");
refresh();
schedulePoll();
