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

function agentCard(entry, activeSet) {
  const active = activeSet?.has(entry.id);
  const activeClass = active ? " agent-card-active" : "";
  const manages =
    entry.manages?.length &&
    `<p class="manages">Manages: ${entry.manages.map((id) => `<code>${esc(id)}</code>`).join(" ")}</p>`;
  const parent = entry.coordinator
    ? `<p class="parent-coord">Coordinator: <code>${esc(entry.coordinator)}</code></p>`
    : "";
  return `
    <article class="agent-card${activeClass}" data-role="${escAttr(entry.role)}" data-category="${escAttr(entry.category)}">
      <header>
        <code class="agent-id">${esc(entry.id)}</code>
        ${roleBadge(entry.role)}
        ${webBadge(entry.needsWeb)}
        ${active ? '<span class="badge active-run">queued this briefing</span>' : ""}
      </header>
      <h4>${esc(entry.name)}</h4>
      <p>${esc(entry.description)}</p>
      ${parent}
      ${manages || ""}
      <p class="skills">${esc((entry.skills ?? []).join(", ") || "—")}</p>
    </article>`;
}

function renderRoster(rosterPayload, report) {
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
      <div class="roster-section-grid">${list.map((e) => agentCard(e, activeIds)).join("")}</div>`,
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
  const rows = [
    ["Status", sup.status ?? st.supervisor_status ?? "—"],
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
  const s = sup.status ?? st.supervisor_status ?? "idle";
  pill.textContent = s;
  pill.className = `pill ${s === "running_agent" ? "running" : s}`;
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
    renderRuns(report);
    renderHeap(report, roster);
    renderRoadmap(report);
    renderRoster(roster, report);
    renderMeta(report, status, roster);
    $("#updated").textContent = `Updated ${new Date().toLocaleTimeString()}`;
  } catch (e) {
    $("#status-pill").textContent = "offline";
    $("#interventions").innerHTML =
      '<li class="empty">Run <code>npm run dashboard</code> and <code>npm run supervisor</code></li>';
    console.error(e);
  }
}

$("#refresh").addEventListener("click", refresh);
$("#tick").addEventListener("click", async () => {
  $("#tick").disabled = true;
  try {
    await fetchJson("/api/tick", { method: "POST" });
    await refresh();
  } catch (e) {
    console.error(e);
  } finally {
    $("#tick").disabled = false;
  }
});

refresh();
setInterval(refresh, 15_000);
