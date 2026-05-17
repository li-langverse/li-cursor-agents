#!/usr/bin/env node
/**
 * Web GUI dashboard for li-cursor-agents.
 * Serves a single-page app with real-time stats, agent management, and cycle history.
 */
import { loadDotEnv } from "../env.js";
loadDotEnv();

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { AGENT_REGISTRY } from "../agents/registry.js";
import { runAgent, shouldUseMock, agentsPackageRoot } from "../runner.js";
import { loadHistory, saveHistory, createCycle, recordRun, pruneHistory } from "../history.js";
import { decideAgents } from "../adaptive-scheduler.js";
import { generateDigest, writeDigest } from "../digest.js";
import type { AgentId } from "../types.js";

const root = agentsPackageRoot();
const PORT = parseInt(process.env.PORT || "3000", 10);

let activeCycle: { agentId: string; status: string; progress: number; total: number } | null = null;
let cycleLog: string[] = [];

function apiResponse(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
  res.end(JSON.stringify(data));
}

function getStats() {
  const history = loadHistory(root);
  const cycles = history.cycles;
  const totalCycles = cycles.length;
  const totalRuns = cycles.reduce((s, c) => s + c.results.length, 0);
  const totalFindings = cycles.reduce((s, c) => s + c.results.reduce((s2, r) => s2 + (r.findings?.length ?? 0), 0), 0);
  const totalErrors = cycles.reduce((s, c) => s + c.results.filter((r) => r.status === "error").length, 0);
  const totalOk = cycles.reduce((s, c) => s + c.results.filter((r) => r.status === "finished").length, 0);
  const avgDuration = totalRuns > 0
    ? cycles.reduce((s, c) => s + c.results.reduce((s2, r) => s2 + r.durationMs, 0), 0) / totalRuns
    : 0;

  const agentStats = AGENT_REGISTRY.map((a) => {
    const runs = cycles.flatMap((c) => c.results).filter((r) => r.agentId === a.id);
    const lastRun = runs[runs.length - 1];
    const okCount = runs.filter((r) => r.status === "finished").length;
    const errCount = runs.filter((r) => r.status === "error").length;
    const findings = runs.reduce((s, r) => s + (r.findings?.length ?? 0), 0);
    return {
      id: a.id, name: a.name, needsWeb: a.needsWeb, promptFile: a.promptFile,
      skills: a.skills, totalRuns: runs.length, okCount, errCount, findings,
      lastRun: lastRun ? { status: lastRun.status, timestamp: lastRun.timestamp, durationMs: lastRun.durationMs, findings: lastRun.findings } : null,
    };
  });

  const recentCycles = cycles.slice(-20).map((c) => ({
    cycleId: c.cycleId,
    startedAt: c.startedAt,
    completedAt: c.completedAt,
    agentsRun: c.agentsRun,
    resultCount: c.results.length,
    okCount: c.results.filter((r) => r.status === "finished").length,
    errCount: c.results.filter((r) => r.status === "error").length,
    findings: c.results.reduce((s, r) => s + (r.findings?.length ?? 0), 0),
    nextPriorities: c.nextPriorities,
  }));

  const schedule = decideAgents(history, { maxAgents: 7 });

  return {
    totalCycles, totalRuns, totalFindings, totalErrors, totalOk, avgDuration,
    agentStats, recentCycles, schedule,
    activeCycle, cycleLog: cycleLog.slice(-50),
    lastUpdated: history.lastUpdated,
  };
}

async function runSingleAgentApi(agentId: AgentId) {
  const result = await runAgent({ agentId, cwd: root, mock: true, dryRun: false });
  const history = loadHistory(root);
  if (history.cycles.length === 0) createCycle(history);
  const cycle = history.cycles[history.cycles.length - 1];
  recordRun(cycle, result);
  saveHistory(root, history);
  return result;
}

async function runCycleApi() {
  cycleLog = [];
  const history = loadHistory(root);
  const cycle = createCycle(history);
  const schedule = decideAgents(history, { maxAgents: 7 });

  cycleLog.push(`Scheduled ${schedule.agents.length} agents: ${schedule.agents.join(", ")}`);
  const total = schedule.agents.length + 1;
  let progress = 0;

  for (const agentId of schedule.agents) {
    progress++;
    activeCycle = { agentId, status: "running", progress, total };
    cycleLog.push(`Running ${agentId}...`);

    try {
      const result = await runAgent({ agentId, cwd: root, mock: true, dryRun: false });
      recordRun(cycle, result);
      const findings = result.outputText
        ? result.outputText.split("\n").filter((l) => l.trim().startsWith("- **") && l.includes("**:")).length
        : 0;
      cycleLog.push(`  ✓ ${agentId} (${result.durationMs}ms, ${findings} findings)`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      cycleLog.push(`  ✗ ${agentId}: ${msg}`);
      recordRun(cycle, {
        agentId, backend: "mock", status: "error",
        durationMs: 0, outputPath: "", error: msg,
      });
    }
  }

  progress++;
  activeCycle = { agentId: "self_improve", status: "running", progress, total };
  cycleLog.push("Running self_improve (reflection)...");
  try {
    const result = await runAgent({ agentId: "self_improve", cwd: root, mock: true, dryRun: false });
    recordRun(cycle, result);
    cycleLog.push("  ✓ self_improve");
  } catch {
    cycleLog.push("  ✗ self_improve");
  }

  cycle.completedAt = new Date().toISOString();
  cycle.nextPriorities = schedule.agents.slice(0, 3);

  const digest = generateDigest({ root, cycle });
  const digestPath = writeDigest(root, cycle, digest);
  cycle.digest = digestPath;
  pruneHistory(history);
  saveHistory(root, history);

  activeCycle = null;
  const ok = cycle.results.filter((r) => r.status === "finished").length;
  const err = cycle.results.filter((r) => r.status === "error").length;
  cycleLog.push(`Cycle complete: ${ok} ok, ${err} errors`);

  return { cycleId: cycle.cycleId, ok, err };
}

async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  const path = url.pathname;

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

  try {
    if (path === "/" || path === "/index.html") {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(getHtml());
    } else if (path === "/api/stats") {
      apiResponse(res, 200, getStats());
    } else if (path === "/api/run" && req.method === "POST") {
      const agentId = url.searchParams.get("agent") as AgentId;
      if (!agentId) { apiResponse(res, 400, { error: "missing ?agent=" }); return; }
      const result = await runSingleAgentApi(agentId);
      apiResponse(res, 200, result);
    } else if (path === "/api/cycle" && req.method === "POST") {
      const result = await runCycleApi();
      apiResponse(res, 200, result);
    } else if (path === "/api/agents") {
      apiResponse(res, 200, AGENT_REGISTRY);
    } else if (path === "/api/digest") {
      const history = loadHistory(root);
      const last = history.cycles[history.cycles.length - 1];
      if (last?.digest && existsSync(last.digest)) {
        const content = readFileSync(last.digest, "utf8");
        apiResponse(res, 200, { path: last.digest, content });
      } else {
        apiResponse(res, 404, { error: "no digest yet" });
      }
    } else {
      apiResponse(res, 404, { error: "not found" });
    }
  } catch (err) {
    apiResponse(res, 500, { error: err instanceof Error ? err.message : String(err) });
  }
}

const server = createServer((req, res) => { handleRequest(req, res).catch(() => {}); });
server.listen(PORT, () => {
  console.log(`\n  🌐 Dashboard running at http://localhost:${PORT}\n`);
});

function getHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>li-cursor-agents Dashboard</title>
<style>
:root{--bg:#0d1117;--card:#161b22;--border:#30363d;--text:#c9d1d9;--text2:#8b949e;--blue:#58a6ff;--green:#3fb950;--red:#f85149;--yellow:#d29922;--purple:#bc8cff;--cyan:#39d2c0}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:var(--bg);color:var(--text);min-height:100vh}
.header{background:linear-gradient(135deg,#1a1f35,#0d1117);border-bottom:1px solid var(--border);padding:20px 32px;display:flex;align-items:center;gap:16px}
.header h1{font-size:20px;font-weight:600;color:#fff}
.header .badge{background:var(--green);color:#000;font-size:11px;font-weight:700;padding:2px 8px;border-radius:10px}
.header .badge.mock{background:var(--yellow)}
.container{max-width:1400px;margin:0 auto;padding:24px}
.stats-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:16px;margin-bottom:24px}
.stat-card{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:20px;text-align:center}
.stat-card .value{font-size:32px;font-weight:700;color:var(--blue)}
.stat-card .value.green{color:var(--green)}
.stat-card .value.red{color:var(--red)}
.stat-card .value.yellow{color:var(--yellow)}
.stat-card .label{font-size:12px;color:var(--text2);margin-top:4px;text-transform:uppercase;letter-spacing:0.5px}
.grid-2{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-bottom:24px}
@media(max-width:900px){.grid-2{grid-template-columns:1fr}}
.panel{background:var(--card);border:1px solid var(--border);border-radius:12px;overflow:hidden}
.panel-header{display:flex;justify-content:space-between;align-items:center;padding:16px 20px;border-bottom:1px solid var(--border)}
.panel-header h2{font-size:14px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;color:var(--text2)}
.panel-body{padding:16px 20px}
table{width:100%;border-collapse:collapse}
th{text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:var(--text2);padding:8px 12px;border-bottom:1px solid var(--border)}
td{padding:10px 12px;border-bottom:1px solid var(--border);font-size:13px;vertical-align:middle}
tr:last-child td{border-bottom:none}
tr:hover{background:rgba(88,166,255,0.04)}
.status-dot{width:8px;height:8px;border-radius:50%;display:inline-block;margin-right:6px}
.status-dot.ok{background:var(--green)}
.status-dot.error{background:var(--red)}
.status-dot.never{background:var(--border)}
.tag{font-size:10px;padding:2px 6px;border-radius:4px;font-weight:600}
.tag.web{background:rgba(210,153,34,0.15);color:var(--yellow)}
.tag.skill{background:rgba(188,140,255,0.15);color:var(--purple)}
.btn{background:var(--blue);color:#fff;border:none;padding:6px 14px;border-radius:6px;cursor:pointer;font-size:12px;font-weight:600;transition:opacity .15s}
.btn:hover{opacity:.85}
.btn:disabled{opacity:.4;cursor:not-allowed}
.btn.sm{padding:4px 10px;font-size:11px}
.btn.green{background:var(--green);color:#000}
.btn.red{background:var(--red)}
.chart-bar{display:flex;align-items:end;gap:3px;height:80px;padding:8px 0}
.chart-col{display:flex;flex-direction:column;align-items:center;flex:1;gap:2px}
.chart-col .bar{width:100%;border-radius:3px 3px 0 0;min-height:2px;transition:height .3s}
.chart-col .bar.ok{background:var(--green)}
.chart-col .bar.err{background:var(--red)}
.chart-col .lbl{font-size:9px;color:var(--text2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:50px}
.progress{height:6px;background:var(--border);border-radius:3px;overflow:hidden;margin:8px 0}
.progress .fill{height:100%;background:var(--blue);border-radius:3px;transition:width .3s}
.log{font-family:'SF Mono',Consolas,monospace;font-size:12px;line-height:1.6;max-height:250px;overflow-y:auto;color:var(--text2)}
.log .ok{color:var(--green)} .log .err{color:var(--red)}
.actions{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0}
.finding{font-size:12px;color:var(--text2);padding:4px 0;border-bottom:1px solid var(--border)}
.finding:last-child{border:none}
.schedule-item{display:flex;align-items:center;gap:8px;padding:6px 0;font-size:13px}
.schedule-num{width:22px;height:22px;border-radius:50%;background:var(--blue);color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0}
.toast{position:fixed;bottom:20px;right:20px;background:var(--card);border:1px solid var(--green);border-radius:8px;padding:12px 20px;font-size:13px;z-index:999;opacity:0;transition:opacity .3s;pointer-events:none}
.toast.show{opacity:1}
.refresh-dot{width:6px;height:6px;border-radius:50%;background:var(--green);display:inline-block;margin-left:8px;animation:pulse 2s infinite}
@keyframes pulse{0%,100%{opacity:.3}50%{opacity:1}}
</style>
</head>
<body>
<div class="header">
  <h1>li-cursor-agents</h1>
  <span class="badge mock">MOCK</span>
  <span style="flex:1"></span>
  <span style="font-size:12px;color:var(--text2)">Auto-refresh<span class="refresh-dot"></span></span>
</div>

<div class="container">
  <div class="stats-grid" id="stats-grid"></div>

  <div class="grid-2">
    <div class="panel">
      <div class="panel-header">
        <h2>Agents</h2>
        <div>
          <button class="btn green" onclick="runCycle()" id="btn-cycle">Run Cycle</button>
          <button class="btn" onclick="runAll()" id="btn-all">Run All</button>
        </div>
      </div>
      <div class="panel-body" style="padding:0">
        <table><thead><tr><th>Agent</th><th>Status</th><th>Runs</th><th>Findings</th><th></th></tr></thead>
        <tbody id="agent-table"></tbody></table>
      </div>
    </div>

    <div style="display:flex;flex-direction:column;gap:24px">
      <div class="panel">
        <div class="panel-header"><h2>Cycle History</h2></div>
        <div class="panel-body">
          <div class="chart-bar" id="history-chart"></div>
        </div>
      </div>

      <div class="panel">
        <div class="panel-header"><h2>Next Cycle</h2></div>
        <div class="panel-body" id="schedule-panel"></div>
      </div>

      <div class="panel" id="live-panel" style="display:none">
        <div class="panel-header"><h2>Live Cycle</h2></div>
        <div class="panel-body">
          <div class="progress"><div class="fill" id="cycle-progress"></div></div>
          <div class="log" id="cycle-log"></div>
        </div>
      </div>
    </div>
  </div>

  <div class="panel" style="margin-bottom:24px">
    <div class="panel-header"><h2>Recent Cycles</h2></div>
    <div class="panel-body" style="padding:0">
      <table><thead><tr><th>Cycle</th><th>Started</th><th>Agents</th><th>OK</th><th>Errors</th><th>Findings</th><th>Next</th></tr></thead>
      <tbody id="cycles-table"></tbody></table>
    </div>
  </div>
</div>

<div class="toast" id="toast"></div>

<script>
let data = null;

async function fetchStats() {
  try {
    const r = await fetch('/api/stats');
    data = await r.json();
    render();
  } catch(e) { console.error(e); }
}

function render() {
  if (!data) return;
  renderStats();
  renderAgents();
  renderChart();
  renderSchedule();
  renderCycles();
  renderLive();
}

function renderStats() {
  const g = document.getElementById('stats-grid');
  const successRate = data.totalRuns > 0 ? ((data.totalOk / data.totalRuns) * 100).toFixed(0) : '—';
  g.innerHTML = [
    card(data.totalCycles, 'Cycles', ''),
    card(data.totalRuns, 'Total Runs', ''),
    card(data.totalOk, 'Successful', 'green'),
    card(data.totalErrors, 'Errors', data.totalErrors > 0 ? 'red' : ''),
    card(data.totalFindings, 'Findings', 'yellow'),
    card(successRate + '%', 'Success Rate', successRate === '100' ? 'green' : ''),
  ].join('');
}

function card(val, label, cls) {
  return '<div class="stat-card"><div class="value ' + cls + '">' + val + '</div><div class="label">' + label + '</div></div>';
}

function renderAgents() {
  const t = document.getElementById('agent-table');
  t.innerHTML = data.agentStats.map(a => {
    const st = a.lastRun ? (a.lastRun.status === 'finished' ? 'ok' : 'error') : 'never';
    const stLabel = a.lastRun ? (a.lastRun.status === 'finished' ? 'OK' : 'Error') : 'Never';
    const web = a.needsWeb ? ' <span class="tag web">web</span>' : '';
    const when = a.lastRun ? timeAgo(a.lastRun.timestamp) : '';
    return '<tr><td><strong>' + a.name + '</strong>' + web +
      '<br><span style="font-size:11px;color:var(--text2)">' + a.id + '</span></td>' +
      '<td><span class="status-dot ' + st + '"></span>' + stLabel +
      (when ? '<br><span style="font-size:11px;color:var(--text2)">' + when + '</span>' : '') + '</td>' +
      '<td>' + a.totalRuns + '</td><td>' + a.findings + '</td>' +
      '<td><button class="btn sm" onclick="runOne(\\'' + a.id + '\\')">Run</button></td></tr>';
  }).join('');
}

function renderChart() {
  const c = document.getElementById('history-chart');
  const cycles = data.recentCycles.slice(-15);
  if (cycles.length === 0) { c.innerHTML = '<span style="color:var(--text2);font-size:12px">No cycles yet</span>'; return; }
  const maxVal = Math.max(...cycles.map(cy => cy.okCount + cy.errCount), 1);
  c.innerHTML = cycles.map(cy => {
    const okH = Math.max((cy.okCount / maxVal) * 60, 2);
    const errH = Math.max((cy.errCount / maxVal) * 60, cy.errCount > 0 ? 2 : 0);
    const label = cy.cycleId.split('-').pop().slice(-4);
    return '<div class="chart-col">' +
      '<div class="bar err" style="height:' + errH + 'px" title="' + cy.errCount + ' errors"></div>' +
      '<div class="bar ok" style="height:' + okH + 'px" title="' + cy.okCount + ' ok"></div>' +
      '<div class="lbl">' + label + '</div></div>';
  }).join('');
}

function renderSchedule() {
  const p = document.getElementById('schedule-panel');
  if (!data.schedule) { p.innerHTML = '<span style="color:var(--text2)">No schedule</span>'; return; }
  p.innerHTML = data.schedule.agents.map((a, i) => {
    const def = data.agentStats.find(s => s.id === a);
    const name = def ? def.name : a;
    return '<div class="schedule-item"><span class="schedule-num">' + (i+1) + '</span><span>' + name + '</span></div>';
  }).join('') + '<div style="margin-top:12px;font-size:11px;color:var(--text2)">' +
    data.schedule.reasoning[data.schedule.reasoning.length - 1] + '</div>';
}

function renderCycles() {
  const t = document.getElementById('cycles-table');
  t.innerHTML = data.recentCycles.slice().reverse().slice(0,10).map(cy => {
    const started = new Date(cy.startedAt).toLocaleString();
    const next = (cy.nextPriorities || []).slice(0,3).join(', ');
    return '<tr><td style="font-family:monospace;font-size:11px">' + cy.cycleId.slice(0,18) + '</td>' +
      '<td style="font-size:12px">' + started + '</td>' +
      '<td>' + cy.agentsRun.length + '</td>' +
      '<td style="color:var(--green)">' + cy.okCount + '</td>' +
      '<td style="color:' + (cy.errCount > 0 ? 'var(--red)' : 'var(--text2)') + '">' + cy.errCount + '</td>' +
      '<td>' + cy.findings + '</td>' +
      '<td style="font-size:11px;color:var(--text2)">' + next + '</td></tr>';
  }).join('');
}

function renderLive() {
  const panel = document.getElementById('live-panel');
  if (data.activeCycle) {
    panel.style.display = 'block';
    const pct = (data.activeCycle.progress / data.activeCycle.total * 100).toFixed(0);
    document.getElementById('cycle-progress').style.width = pct + '%';
  } else if (data.cycleLog.length > 0) {
    panel.style.display = 'block';
  }
  const log = document.getElementById('cycle-log');
  log.innerHTML = data.cycleLog.map(l => {
    const cls = l.includes('✓') ? 'ok' : l.includes('✗') ? 'err' : '';
    return '<div class="' + cls + '">' + escHtml(l) + '</div>';
  }).join('');
  log.scrollTop = log.scrollHeight;
}

function escHtml(s) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function timeAgo(ts) {
  const diff = Date.now() - new Date(ts).getTime();
  if (diff < 60000) return Math.floor(diff/1000) + 's ago';
  if (diff < 3600000) return Math.floor(diff/60000) + 'm ago';
  if (diff < 86400000) return Math.floor(diff/3600000) + 'h ago';
  return Math.floor(diff/86400000) + 'd ago';
}

function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 3000);
}

async function runOne(id) {
  toast('Running ' + id + '...');
  try {
    await fetch('/api/run?agent=' + id, { method: 'POST' });
    toast(id + ' completed');
    fetchStats();
  } catch(e) { toast('Error: ' + e.message); }
}

async function runAll() {
  const btn = document.getElementById('btn-all');
  btn.disabled = true;
  btn.textContent = 'Running...';
  for (const a of data.agentStats) {
    toast('Running ' + a.id + '...');
    try { await fetch('/api/run?agent=' + a.id, { method: 'POST' }); } catch {}
    await fetchStats();
  }
  btn.disabled = false;
  btn.textContent = 'Run All';
  toast('All agents completed');
}

async function runCycle() {
  const btn = document.getElementById('btn-cycle');
  btn.disabled = true;
  btn.textContent = 'Cycling...';
  document.getElementById('live-panel').style.display = 'block';

  const poll = setInterval(fetchStats, 1000);
  try {
    await fetch('/api/cycle', { method: 'POST' });
    toast('Cycle completed');
  } catch(e) { toast('Cycle error: ' + e.message); }
  clearInterval(poll);
  btn.disabled = false;
  btn.textContent = 'Run Cycle';
  fetchStats();
}

fetchStats();
setInterval(fetchStats, 5000);
</script>
</body>
</html>`;
}
