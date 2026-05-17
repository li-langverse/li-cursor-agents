const $ = (sel) => document.querySelector(sel);

async function fetchJson(path, options) {
  const res = await fetch(path, { cache: "no-store", ...options });
  if (!res.ok) throw new Error(`${path} ${res.status}`);
  return res.json();
}

function sevClass(i) {
  const s = i.severity ?? "medium";
  if (s === "critical" || s === "P0") return "severity-p0";
  if (s === "high" || s === "P1") return "severity-p1";
  return "severity-p2";
}

function renderInterventions(report) {
  const list = $("#interventions");
  const items = report?.interventions ?? [];
  if (!items.length) {
    list.innerHTML =
      '<li class="empty">No interventions — supervisor can run automated agents.</li>';
    return;
  }
  list.innerHTML = items
    .map(
      (i) => `
    <li class="intervention ${sevClass(i)}">
      <h4>${esc(i.title)}</h4>
      <p>${esc(i.detail)}</p>
      <p class="action">${esc(i.action ?? "")}</p>
      ${(i.links ?? [])
        .map((u) => `<a href="${escAttr(u)}" target="_blank" rel="noopener">${esc(u)}</a>`)
        .join(" ")}
    </li>`,
    )
    .join("");
}

function renderRecommended(report) {
  const list = $("#queue");
  const rec = report?.recommended_agents ?? [];
  if (!rec.length) {
    list.innerHTML = '<li class="empty">No recommended agents in briefing</li>';
    return;
  }
  list.innerHTML = rec
    .map((r) => `<li><strong>${esc(r.agent)}</strong> — ${esc(r.reason)}</li>`)
    .join("");
}

function renderRuns(report) {
  const list = $("#runs");
  const runs = report?.recent_runs ?? [];
  if (!runs.length) {
    list.innerHTML = '<li class="empty">No runs yet</li>';
    return;
  }
  list.innerHTML = runs
    .map(
      (r) =>
        `<li class="run-row"><strong>${esc(r.agentId)}</strong> ${esc(r.status)} · ${esc(r.backend)}</li>`,
    )
    .join("");
}

function roleBadge(role) {
  const labels = { root: "root", coordinator: "coordinator", leaf: "leaf agent" };
  return `<span class="badge role role-${escAttr(role)}" title="${escAttr(labels[role] ?? role)}">${esc(labels[role] ?? role)}</span>`;
}

function webBadge(needsWeb) {
  if (!needsWeb) return "";
  return `<span class="badge web" title="Requires Cursor web search in production">web search</span>`;
}

function agentCard(entry, activeSet, runtime) {
  const active = activeSet?.has(entry.id);
  const stopped = runtime?.stopped_agents?.includes(entry.id);
  const running = (runtime?.active_runs ?? []).find(
    (r) => r.agent_id === entry.id && r.status === "running",
  );
  let stateClass = "";
  if (stopped) stateClass = " agent-card-stopped";
  else if (running) stateClass = " agent-card-running";
  else if (active) stateClass = " agent-card-active";

  const manages =
    entry.manages?.length &&
    `<p class="manages">Manages: ${entry.manages.map((id) => `<code>${esc(id)}</code>`).join(" ")}</p>`;
  const parent = entry.coordinator
    ? `<p class="parent-coord">Coordinator: <code>${esc(entry.coordinator)}</code></p>`
    : "";

  const canControl = entry.role === "leaf" || entry.role === "root";
  const controls = canControl
    ? `<div class="agent-actions">
        <button type="button" class="btn-small primary" data-action="start" data-agent="${escAttr(entry.id)}" ${running ? "disabled" : ""}>Start</button>
        <button type="button" class="btn-small danger" data-action="stop" data-agent="${escAttr(entry.id)}">Stop</button>
        ${stopped ? `<button type="button" class="btn-small" data-action="resume" data-agent="${escAttr(entry.id)}">Resume</button>` : ""}
      </div>`
    : "";

  const statusBadges = [
    active ? '<span class="badge active-run">queued this briefing</span>' : "",
    running ? '<span class="badge running">running</span>' : "",
    stopped ? '<span class="badge stopped">stopped</span>' : "",
  ].join("");

  return `
    <article class="agent-card${stateClass}" data-agent-id="${escAttr(entry.id)}" data-role="${escAttr(entry.role)}" data-category="${escAttr(entry.category)}">
      <header>
        <code class="agent-id">${esc(entry.id)}</code>
        ${roleBadge(entry.role)}
        ${webBadge(entry.needsWeb)}
        ${statusBadges}
      </header>
      <h4>${esc(entry.name)}</h4>
      <p>${esc(entry.description)}</p>
      ${parent}
      ${manages || ""}
      <p class="skills">${esc((entry.skills ?? []).join(", ") || "—")}</p>
      ${controls}
    </article>`;
}

function renderRoster(rosterPayload, report, runtime) {
  const root = $("#roster");
  const entries = rosterPayload?.roster ?? rosterPayload?.agents ?? [];
  const summary = rosterPayload?.total ?? entries.length;

  const activeIds = new Set();
  const hp = report?.heap_plan;
  if (hp?.flat_tasks) {
    for (const t of hp.flat_tasks) activeIds.add(t.agent);
  }
  for (const r of report?.recommended_agents ?? []) activeIds.add(r.agent);

  if (!entries.length) {
    root.innerHTML = '<p class="empty">No agents in registry</p>';
    return;
  }

  const byRole = { root: [], coordinator: [], leaf: [] };
  for (const e of entries) {
    const bucket = byRole[e.role] ?? byRole.leaf;
    bucket.push(e);
  }

  const sections = [
    ["Root orchestrator", byRole.root],
    ["Sub-coordinators (heap)", byRole.coordinator],
    ["Leaf agents", byRole.leaf],
  ];

  root.innerHTML = `
    <p class="roster-summary">${summary} agents in swarm (${rosterPayload?.coordinators ?? 0} coordinators, ${rosterPayload?.leaf_agents ?? 0} leaf). <span class="muted">“web search” = needs live web in production, not “missing from dashboard”.</span></p>
    ${sections
      .map(
        ([title, list]) => `
      <h3 class="roster-section-title">${esc(title)} <span class="count">(${list.length})</span></h3>
      <div class="roster-section-grid">${list.map((e) => agentCard(e, activeIds, runtime)).join("")}</div>`,
      )
      .join("")}`;
}

function renderHeap(report, rosterPayload) {
  const root = $("#heap-layers");
  const hp = report?.heap_plan;
  const activeIds = new Set((hp?.flat_tasks ?? []).map((t) => t.agent));

  const coordinators = rosterPayload?.coordinator_registry ?? [];
  const fullTree = rosterPayload?.roster?.filter((r) => r.role === "coordinator") ?? [];

  if (!fullTree.length && !hp?.layers?.length) {
    root.innerHTML = '<p class="empty">No heap_plan — run agent-briefing.py in benchmarks</p>';
    return;
  }

  const layersById = new Map((hp?.layers ?? []).map((l) => [l.coordinator, l]));

  root.innerHTML = fullTree
    .map((coord) => {
      const layer = layersById.get(coord.id);
      const briefingAgents = layer?.agents ?? [];
      const allLeaves = coord.manages ?? [];
      const leafRows = allLeaves
        .map((agentId) => {
          const inBriefing = briefingAgents.some((a) => a.agent === agentId);
          const active = activeIds.has(agentId);
          const reason = briefingAgents.find((a) => a.agent === agentId)?.reason;
          const flags = [
            active ? '<span class="badge active-run">active</span>' : "",
            inBriefing && !active ? '<span class="badge">in plan</span>' : "",
            !inBriefing ? '<span class="badge idle-leaf">standby</span>' : "",
          ].join(" ");
          return `<li class="${active ? "heap-active" : ""}"><strong>${esc(agentId)}</strong> ${flags}${reason ? ` — ${esc(reason)}` : ""}</li>`;
        })
        .join("");
      return `
    <div class="heap-layer">
      <h4>${esc(coord.name)} <code>${esc(coord.id)}</code> <span class="count">${allLeaves.length} agents</span></h4>
      <p class="heap-desc">${esc(coord.description)}</p>
      <ul>${leafRows}</ul>
    </div>`;
    })
    .join("");
}

function renderRoadmap(report) {
  const el = $("#roadmap-meta");
  const r = report?.org_roadmap;
  if (!r) {
    el.innerHTML = "<dt>Roadmap</dt><dd>—</dd>";
    return;
  }
  const rows = [
    ["Pillars", (r.pillars ?? []).join(", ")],
    ["Current PH", r.current_ph ?? "—"],
    ["Open plan items", String(r.master_plan_open_items ?? "—")],
    ["Vision", r.vision_url ?? "—"],
  ];
  el.innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join("");
}

function renderMeta(report, status, rosterPayload) {
  const sup = report?.supervisor ?? {};
  const st = status?.state ?? {};
  const rt = status?.runtime ?? {};
  const rows = [
    ["Status", sup.status ?? st.supervisor_status ?? "—"],
    ["Supervisor loop", rt.supervisor_loop_running ? "running" : "stopped"],
    ["Active processes", String(rt.active_run_count ?? 0)],
    ["Stopped agents", (rt.stopped_agents ?? []).join(", ") || "—"],
    ["Briefing hash", report?.briefing_hash ?? st.last_briefing_hash ?? "—"],
    ["Swarm size", String(rosterPayload?.total ?? "—")],
    ["Runs total", String(sup.runs_total ?? st.runs_total ?? 0)],
    ["Tasks this tick", String(sup.tasks_executed_this_tick ?? 0)],
    ["Skipped cooldown", String(sup.tasks_skipped_cooldown ?? 0)],
    ["Interventions", String(report?.interventions?.length ?? 0)],
  ];
  $("#supervisor-meta").innerHTML = rows
    .map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`)
    .join("");
  const pill = $("#status-pill");
  let label = sup.status ?? st.supervisor_status ?? "idle";
  if (rt.supervisor_loop_running) label = "supervisor loop";
  else if ((rt.active_run_count ?? 0) > 0) label = "agents running";
  pill.textContent = label;
  pill.className = `pill ${
    rt.supervisor_loop_running || label === "running_agent" || label === "agents running"
      ? "running"
      : label
  }`;
}

function renderActiveRuns(runtime, report) {
  const list = $("#runs");
  const active = runtime?.active_runs ?? [];
  const recent = report?.recent_runs ?? [];
  const rows = [
    ...active.map(
      (r) =>
        `<li class="run-row run-live"><strong>${esc(r.agent_id)}</strong> ${esc(r.status)} · pid ${esc(r.pid)} <button type="button" class="btn-small danger" data-action="cancel-run" data-run-id="${escAttr(r.run_id)}">Kill</button></li>`,
    ),
    ...recent.map(
      (r) =>
        `<li class="run-row"><strong>${esc(r.agentId)}</strong> ${esc(r.status)} · ${esc(r.backend)}</li>`,
    ),
  ];
  if (!rows.length) {
    list.innerHTML = '<li class="empty">No runs yet</li>';
    return;
  }
  list.innerHTML = rows.join("");
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

async function refresh() {
  try {
    const [report, status, roster] = await Promise.all([
      fetchJson("/api/report"),
      fetchJson("/api/status"),
      fetchJson("/api/agents"),
    ]);
    renderInterventions(report);
    renderRecommended(report);
    const runtime = status?.runtime ?? roster?.runtime;
    renderActiveRuns(runtime, report);
    renderHeap(report, roster);
    renderRoadmap(report);
    renderRoster(roster, report, runtime);
    renderMeta(report, status, roster);
    $("#updated").textContent = `Updated ${new Date().toLocaleTimeString()}`;
  } catch (e) {
    $("#status-pill").textContent = "offline";
    $("#interventions").innerHTML =
      '<li class="empty">Run <code>npm run dashboard</code> and <code>npm run supervisor</code></li>';
    console.error(e);
  }
}

async function postControl(path, button) {
  if (button) button.disabled = true;
  try {
    await fetchJson(path, { method: "POST" });
    await refresh();
  } catch (e) {
    console.error(e);
    alert(e instanceof Error ? e.message : String(e));
  } finally {
    if (button) button.disabled = false;
  }
}

$("#refresh").addEventListener("click", refresh);
$("#tick").addEventListener("click", () => postControl("/api/tick", $("#tick")));
$("#supervisor-start").addEventListener("click", () =>
  postControl("/api/supervisor/start", $("#supervisor-start")),
);
$("#supervisor-stop").addEventListener("click", () =>
  postControl("/api/supervisor/stop", $("#supervisor-stop")),
);
$("#swarm-run-all").addEventListener("click", () =>
  postControl("/api/swarm/run-all", $("#swarm-run-all")),
);
$("#swarm-stop-all").addEventListener("click", () =>
  postControl("/api/swarm/stop-all", $("#swarm-stop-all")),
);

$("#roster").addEventListener("click", async (ev) => {
  const btn = ev.target.closest("[data-action]");
  if (!btn || btn.disabled) return;
  const action = btn.getAttribute("data-action");
  const agent = btn.getAttribute("data-agent");
  const runId = btn.getAttribute("data-run-id");
  btn.disabled = true;
  try {
    if (action === "start" && agent) await fetchJson(`/api/agents/${agent}/start`, { method: "POST" });
    else if (action === "stop" && agent)
      await fetchJson(`/api/agents/${agent}/stop`, { method: "POST" });
    else if (action === "resume" && agent)
      await fetchJson(`/api/agents/${agent}/resume`, { method: "POST" });
    else if (action === "cancel-run" && runId)
      await fetchJson(`/api/runs/${runId}/cancel`, { method: "POST" });
    await refresh();
  } catch (e) {
    console.error(e);
    alert(e instanceof Error ? e.message : String(e));
  } finally {
    btn.disabled = false;
  }
});

$("#runs").addEventListener("click", async (ev) => {
  const btn = ev.target.closest('[data-action="cancel-run"]');
  if (!btn) return;
  const runId = btn.getAttribute("data-run-id");
  btn.disabled = true;
  try {
    await fetchJson(`/api/runs/${runId}/cancel`, { method: "POST" });
    await refresh();
  } catch (e) {
    console.error(e);
  } finally {
    btn.disabled = false;
  }
});

refresh();
setInterval(refresh, 5_000);
