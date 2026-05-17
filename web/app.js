const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const ui = {
  view: "overview",
  agentFilter: "all",
  agentSearch: "",
  selectedAgentId: null,
  selectedRunId: null,
  data: null,
};

const VIEW_META = {
  overview: { title: "Overview", subtitle: "Swarm status at a glance" },
  agents: { title: "Agents", subtitle: "Click a row for live status and run output" },
  heap: { title: "Heap plan", subtitle: "Coordinator routing and briefing queue" },
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
    queued: "Queued",
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

function agentStatusMap(roster, report, runtime, statusPayload) {
  const map = new Map();
  const activeRuns = runtime?.active_runs ?? [];
  const stopped = new Set(runtime?.stopped_agents ?? []);
  const currentSupervisor = runtime?.current_supervisor_agent ?? statusPayload?.state?.current_supervisor_agent;
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
    else if (rec.has(entry.id) || heapTasks.has(entry.id)) status = "queued";
    else {
      const last = recentByAgent.get(entry.id);
      const finishedAt = last?.finished_at ? new Date(last.finished_at).getTime() : 0;
      if (last?.status === "finished" && finishedAt && Date.now() - finishedAt < 1_800_000) status = "cooldown";
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
  const [report, status, roster, runsPayload] = await Promise.all([
    fetchJson("/api/report").catch(() => ({})),
    fetchJson("/api/status"),
    fetchJson("/api/agents"),
    fetchJson("/api/runs").catch(() => ({ runs: [], active: [] })),
  ]);
  const runtime = status?.runtime ?? roster?.runtime;
  ui.data = { report, status, roster, runtime, runsPayload };
  return ui.data;
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
  $("#sidebar-stats").innerHTML = `
    <dl>
      <dt>Data store</dt><dd title="History in Supabase; live runs in this process">${esc(store)}</dd>
      <dt>Supervisor</dt><dd>${rt.supervisor_loop_running ? "loop on" : "loop off"}</dd>
      <dt>Running now</dt><dd>${rt.active_run_count ?? 0}</dd>
      <dt>Swarm</dt><dd>${roster?.total ?? "—"} agents</dd>
      <dt>Briefing</dt><dd title="${escAttr(report?.briefing_hash ?? "")}">${esc((report?.briefing_hash ?? "—").slice(0, 12))}</dd>
    </dl>`;

  const sup = report?.supervisor ?? {};
  const st = status?.state ?? {};
  const pill = $("#status-pill");
  let label = sup.status ?? st.supervisor_status ?? "idle";
  if (rt.current_supervisor_agent) label = `running ${rt.current_supervisor_agent}`;
  else if (rt.supervisor_loop_running) label = "supervisor on";
  else if ((rt.active_run_count ?? 0) > 0) label = "agents running";
  pill.textContent = label;
  pill.className = `pill ${label.includes("running") || label.includes("on") ? "running" : "idle"}`;
}

function renderStatCards() {
  const { report, runtime, roster, runsPayload, status } = ui.data;
  const statusMap = agentStatusMap(roster, report, runtime, status);
  let running = 0;
  let queued = 0;
  let stopped = 0;
  let idle = 0;
  let cooldown = 0;
  for (const v of statusMap.values()) {
    if (v.status === "running") running++;
    if (v.status === "queued") queued++;
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

function renderLiveActivity() {
  const { report, runtime, runsPayload } = ui.data;
  const feed = $("#live-activity");
  const items = [];

  for (const r of runtime?.active_runs ?? []) {
    items.push({
      t: r.started_at,
      html: `<strong>${esc(r.agent_id)}</strong> running <span class="mono">pid ${esc(r.pid)}</span> — ${esc(r.reason ?? "")}`,
    });
  }
  for (const r of runsPayload?.runs?.slice(0, 8) ?? []) {
    items.push({
      t: r.started_at,
      html: `<strong>${esc(r.agent_id)}</strong> ${esc(r.status)} <span class="time">${formatTime(r.started_at)}</span>`,
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
  const rec = ui.data.report?.recommended_agents ?? [];
  const el = $("#queue");
  if (!rec.length) {
    el.innerHTML = '<li class="empty">No recommended agents in briefing</li>';
    return;
  }
  el.innerHTML = rec
    .map(
      (r) =>
        `<li><button type="button" class="linkish" data-open-agent="${escAttr(r.agent)}"><strong>${esc(r.agent)}</strong></button> — ${esc(r.reason)}</li>`,
    )
    .join("");
}

function renderRunsTable() {
  const { runsPayload } = ui.data;
  const tbody = $("#runs-table-body");
  const runs = runsPayload?.runs ?? [];
  if (!runs.length) {
    tbody.innerHTML = '<tr><td colspan="4" class="empty">No runs yet</td></tr>';
    return;
  }
  tbody.innerHTML = runs
    .slice(0, 20)
    .map(
      (r) => `
    <tr data-open-run="${escAttr(r.run_id)}" data-agent="${escAttr(r.agent_id)}">
      <td class="mono">${esc(r.agent_id)}</td>
      <td>${statusDot(r.live ? "running" : r.status)}</td>
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
    const order = { running: 0, queued: 1, cooldown: 2, idle: 3, stopped: 4 };
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
  const report = ui.data.report;
  const items = report?.interventions ?? [];
  const list = $("#interventions");
  const staleNote =
    report?.briefing_generated_at && report?.generated_at
      ? `<p class="hint">Interventions from briefing <strong>${esc(report.briefing_generated_at)}</strong> (live; supervisor snapshot was ${esc(String(report.generated_at).slice(0, 19))}).</p>`
      : "";
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
    $("#drawer-run-header").innerHTML = `
      <div>
        <h2><code>${esc(detail.agent_id)}</code></h2>
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
    renderSidebar();
    renderStatCards();
    renderLiveActivity();
    renderQueue();
    renderRunsTable();
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

async function postControl(path, button) {
  if (button) button.disabled = true;
  try {
    await fetchJson(path, { method: "POST" });
    await refresh();
  } catch (e) {
    alert(e.message);
  } finally {
    if (button) button.disabled = false;
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

$("#refresh").addEventListener("click", refresh);
$("#refresh-briefing").addEventListener("click", () =>
  postControl("/api/briefing/refresh", $("#refresh-briefing")),
);
$("#tick").addEventListener("click", () => postControl("/api/tick", $("#tick")));
$("#supervisor-start").addEventListener("click", () => postControl("/api/supervisor/start", $("#supervisor-start")));
$("#supervisor-stop").addEventListener("click", () => postControl("/api/supervisor/stop", $("#supervisor-stop")));
$("#swarm-run-all").addEventListener("click", () => postControl("/api/swarm/run-all", $("#swarm-run-all")));
$("#swarm-stop-all").addEventListener("click", () => postControl("/api/swarm/stop-all", $("#swarm-stop-all")));

$("#backdrop").addEventListener("click", closeDrawers);
$$(".drawer-close").forEach((btn) => {
  btn.addEventListener("click", () => {
    if (btn.dataset.close === "run") $("#run-drawer").hidden = true;
    else closeDrawers();
  });
});

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

setView("overview");
refresh();
setInterval(refresh, 4_000);
