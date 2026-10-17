import './style.css';
import {
  computeHeatmap, computeMetrics, defaultOptimizerOptions, inspectPoint, InvalidScenarioError, optimize, simulate, validateScenario,
  type AccessPoint, type Client, type Metrics, type Recommendation, type Scenario, type SimulationResult,
} from '../engine';
import { SCENARIO_DEFS, buildScenario } from '../data/scenarios';

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const canvas = $('map') as HTMLCanvasElement;
const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;

let scenario: Scenario = buildScenario(SCENARIO_DEFS[0]);
let sel: { kind: 'ap' | 'client'; id: string } | null = null;
let mode: 'select' | 'ap' | 'client' = 'select';
let result: SimulationResult | null = null;
let metrics: Metrics | null = null;
let recs: Recommendation[] = [];
let snaps: { name: string; m: Metrics }[] = [];
let dragging = false;

const px = (): number => canvas.width / scenario.config.widthM;
const f = (v: number | null, d = 1, unit = ''): string => (v === null || !Number.isFinite(v) ? '–' : v.toFixed(d) + unit);
const nextId = (prefix: string, list: { id: string }[]): string => { let n = list.length + 1; while (list.some((d) => d.id === `${prefix}${n}`)) n++; return `${prefix}${n}`; };

function refresh(): void {
  const errBox = $('error');
  try {
    result = simulate(scenario);
    metrics = computeMetrics(scenario, result);
    errBox.hidden = true;
  } catch (e) {
    if (!(e instanceof InvalidScenarioError)) throw e;
    result = null; metrics = null;
    errBox.textContent = 'Invalid configuration – results hidden: ' + e.errors.join('; ');
    errBox.hidden = false;
  }
  draw(); renderMetrics(); renderCompare(); renderRecs();
  if (!dragging) renderEditor();
}

/* ---------- drawing ---------- */
function rssiColor(rssi: number, minRssi: number): string {
  if (rssi < minRssi) return '#2a2e38';                       // below threshold: dark = no usable coverage
  const t = Math.min(1, (rssi - minRssi) / (-40 - minRssi));  // minRssi..-40 dBm -> orange..green
  return `hsl(${20 + 110 * t} 75% 45%)`;
}

function draw(): void {
  const c = scenario.config;
  if (!result || !(c.widthM > 0 && c.heightM > 0)) { ctx.clearRect(0, 0, canvas.width, canvas.height); return; }
  canvas.height = Math.round((canvas.width * c.heightM) / c.widthM);
  const k = px();
  const cols = Math.min(120, Math.max(10, Math.round(c.widthM))), rows = Math.max(5, Math.round((cols * c.heightM) / c.widthM));
  const hm = computeHeatmap(scenario, cols, rows);
  for (let r = 0; r < rows; r++) for (let q = 0; q < cols; q++) {
    ctx.fillStyle = rssiColor(hm.rssiDbm[r * cols + q], c.minRssiDbm);
    ctx.fillRect(q * hm.cellW * k, r * hm.cellH * k, hm.cellW * k + 1, hm.cellH * k + 1);
  }
  ctx.strokeStyle = '#e5e7eb'; ctx.lineWidth = 3;
  for (const w of scenario.walls) { ctx.beginPath(); ctx.moveTo(w.x1 * k, w.y1 * k); ctx.lineTo(w.x2 * k, w.y2 * k); ctx.stroke(); }
  const apById = new Map(scenario.aps.map((a) => [a.id, a]));
  const cById = new Map(scenario.clients.map((a) => [a.id, a]));
  ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(255,255,255,.55)';
  for (const r of result.clients) {                            // association links
    const a = r.servingApId ? apById.get(r.servingApId) : null, cl = cById.get(r.id);
    if (a && cl) { ctx.beginPath(); ctx.moveTo(a.x * k, a.y * k); ctx.lineTo(cl.x * k, cl.y * k); ctx.stroke(); }
  }
  for (const r of result.clients) {                            // clients: blue=associated, amber=in coverage but not associated, red=no usable signal
    const cl = cById.get(r.id); if (!cl) continue;
    ctx.beginPath(); ctx.arc(cl.x * k, cl.y * k, 5, 0, 7);
    ctx.fillStyle = r.servingApId ? '#3b82f6' : r.meetsSignal ? '#f59e0b' : '#ef4444'; ctx.fill();
    ctx.lineWidth = sel?.id === r.id ? 3 : 1.5; ctx.strokeStyle = sel?.id === r.id ? '#fff' : '#111'; ctx.stroke();
  }
  ctx.font = '12px system-ui';
  for (const a of scenario.aps) {
    ctx.fillStyle = '#fff'; ctx.strokeStyle = sel?.id === a.id ? '#3b82f6' : '#000'; ctx.lineWidth = sel?.id === a.id ? 3 : 1.5;
    ctx.fillRect(a.x * k - 7, a.y * k - 7, 14, 14); ctx.strokeRect(a.x * k - 7, a.y * k - 7, 14, 14);
    ctx.fillStyle = '#fff'; ctx.fillText(`${a.id} ch${a.channel}`, a.x * k + 10, a.y * k - 8);
  }
  const lg = $('legend');
  lg.innerHTML = `<span>RSSI: <span class="bar" style="background:linear-gradient(90deg,${rssiColor(c.minRssiDbm, c.minRssiDbm)},${rssiColor(c.minRssiDbm + 1, c.minRssiDbm)},${rssiColor(-40, c.minRssiDbm)})"></span> ${c.minRssiDbm} dBm → −40 dBm (best-server)</span>
    <span><i style="background:#2a2e38;border:1px solid #888"></i>below ${c.minRssiDbm} dBm</span>
    <span><i style="background:#3b82f6"></i>associated</span><span><i style="background:#f59e0b"></i>in coverage, not associated</span><span><i style="background:#ef4444"></i>no usable signal</span><span>▢ AP</span>`;
}

/* ---------- panels ---------- */
function renderMetrics(): void {
  const t = $('metrics');
  if (!metrics) { t.innerHTML = '<tr><td>No results (invalid configuration)</td></tr>'; return; }
  t.innerHTML = metricRows(metrics).map(([l, v]) => `<tr><td>${l}</td><td>${v}</td></tr>`).join('') +
    (result ? '<tr><td colspan="2" style="text-align:left;color:var(--muted)">Noise floor ' + f(result.noiseDbm, 1, ' dBm') + '</td></tr>' : '');
}
function metricRows(m: Metrics): [string, string][] {
  return [
    ['Access points', String(m.apCount)], ['Clients (associated / total)', `${m.associatedClients} / ${m.totalClients}`],
    ['Disconnected clients', String(m.disconnectedClients)], ['% meeting signal req.', f(m.pctMeetingSignal, 0, '%')],
    ['% meeting throughput req.', f(m.pctMeetingThroughput, 0, '%')], ['Mean / worst RSSI', `${f(m.meanRssiDbm, 0)} / ${f(m.worstRssiDbm, 0)} dBm`],
    ['Mean / worst SINR', `${f(m.meanSinrDb, 1)} / ${f(m.worstSinrDb, 1)} dB`],
    ['Throughput / demand', `${f(m.aggregateThroughputMbps, 1)} / ${f(m.aggregateDemandMbps, 1)} Mbps`],
    ['Overloaded APs', String(m.overloadedAps)], ['Equipment cost', '$' + m.equipmentCostUsd],
  ];
}
function renderCompare(): void {
  const cols = [...snaps, ...(metrics ? [{ name: 'Current', m: metrics }] : [])];
  const t = $('compare');
  if (!cols.length) { t.innerHTML = '<tr><td>Save a snapshot, change the network, then compare.</td></tr>'; return; }
  const rows = cols.map((c) => metricRows(c.m));
  t.innerHTML = `<tr><th></th>${cols.map((c) => `<th>${c.name}</th>`).join('')}</tr>` +
    rows[0].map(([label], i) => `<tr><td>${label}</td>${rows.map((r) => `<td>${r[i][1]}</td>`).join('')}</tr>`).join('');
}
function renderRecs(): void {
  const box = $('recs');
  if (!recs.length) { box.innerHTML = box.dataset.ran ? '<div class="empty">No improving placement found (target met, or no candidate raises the objective).</div>' : ''; return; }
  box.innerHTML = '';
  recs.forEach((r, i) => {
    const d = document.createElement('div'); d.className = 'rec';
    d.innerHTML = `<b>Step ${r.step}: add AP at (${r.ap.x}, ${r.ap.y}) m, ch ${r.ap.channel}</b><br>
      Signal ${f(r.before.pctMeetingSignal, 0)}% → ${f(r.after.pctMeetingSignal, 0)}% · Throughput ${f(r.before.pctMeetingThroughput, 0)}% → ${f(r.after.pctMeetingThroughput, 0)}%<br>
      Overloaded APs ${r.before.overloadedAps} → ${r.after.overloadedAps} · Cost $${r.before.equipmentCostUsd} → $${r.after.equipmentCostUsd}<br>`;
    const b = document.createElement('button'); b.textContent = `Apply steps 1–${r.step}`;
    b.onclick = () => { scenario = { ...scenario, aps: [...scenario.aps, ...recs.slice(0, i + 1).map((x) => x.ap)] }; recs = []; refresh(); };
    d.appendChild(b); box.appendChild(d);
  });
  const rej = document.createElement('button'); rej.textContent = 'Reject all'; rej.onclick = () => { recs = []; refresh(); }; box.appendChild(rej);
}

type Num = { get: () => number; set: (v: number) => void; label: string; step?: number };
function numField(parent: HTMLElement, n: Num): void {
  const l = document.createElement('label'); l.textContent = n.label;
  const i = document.createElement('input'); i.type = 'number'; i.step = String(n.step ?? 'any'); i.value = String(n.get());
  i.onchange = () => { n.set(i.value === '' ? NaN : parseFloat(i.value)); recs = []; refresh(); };
  l.appendChild(i); parent.appendChild(l);
}
function renderEditor(): void {
  const box = $('editor'); box.innerHTML = '';
  const dev: AccessPoint | Client | undefined = sel ? (sel.kind === 'ap' ? scenario.aps : scenario.clients).find((d) => d.id === sel!.id) : undefined;
  if (!sel || !dev) { sel = null; box.textContent = 'Click a device to edit it. Delete key removes it.'; return; }
  const h = document.createElement('div'); h.innerHTML = `<b>${dev.id}</b> `;
  const del = document.createElement('button'); del.textContent = 'Delete'; del.onclick = deleteSelected; h.appendChild(del); box.appendChild(h);
  const o = dev as unknown as Record<string, number>;
  const fields: [string, string][] = sel.kind === 'ap'
    ? [['x', 'x (m)'], ['y', 'y (m)'], ['txPowerDbm', 'TX power (dBm)'], ['antennaGainDbi', 'Antenna gain (dBi)'], ['freqMHz', 'Frequency (MHz)'], ['channel', 'Channel'], ['maxClients', 'Max clients'], ['costUsd', 'Cost (USD)']]
    : [['x', 'x (m)'], ['y', 'y (m)'], ['demandMbps', 'Demand (Mbps)']];
  for (const [key, label] of fields) numField(box, { label, get: () => o[key], set: (v) => { o[key] = v; } });
}
function renderConfig(): void {
  const box = $('config'); box.innerHTML = '';
  const c = scenario.config as unknown as Record<string, number | string>;
  const m = document.createElement('label'); m.textContent = 'Path-loss model';
  const s = document.createElement('select'); s.innerHTML = '<option value="log-distance">log-distance</option><option value="fspl">free-space</option>'; s.value = scenario.config.model;
  s.onchange = () => { scenario.config.model = s.value as 'fspl' | 'log-distance'; recs = []; refresh(); }; m.appendChild(s); box.appendChild(m);
  const keys: [string, string][] = [['widthM', 'Width (m)'], ['heightM', 'Height (m)'], ['pathLossExponent', 'Path-loss exponent n'], ['bandwidthMHz', 'Bandwidth (MHz)'], ['noiseFigureDb', 'Noise figure (dB)'],
    ['minRssiDbm', 'Min RSSI (dBm)'], ['minSnrDb', 'Min SNR (dB)'], ['protocolEfficiency', 'Protocol efficiency'], ['minThroughputMbps', 'Min throughput (Mbps)']];
  for (const [key, label] of keys) numField(box, { label, get: () => c[key] as number, set: (v) => { c[key] = v; } });
}

/* ---------- interaction ---------- */
function toModel(e: PointerEvent): { x: number; y: number } {
  const r = canvas.getBoundingClientRect();
  return { x: ((e.clientX - r.left) / r.width) * scenario.config.widthM, y: ((e.clientY - r.top) / r.height) * scenario.config.heightM };
}
function hit(x: number, y: number): { kind: 'ap' | 'client'; id: string } | null {
  const tol = (14 / px()) * (canvas.getBoundingClientRect().width ? canvas.width / canvas.getBoundingClientRect().width : 1);
  for (const a of scenario.aps) if (Math.abs(a.x - x) < tol && Math.abs(a.y - y) < tol) return { kind: 'ap', id: a.id };
  for (const c of scenario.clients) if (Math.hypot(c.x - x, c.y - y) < tol) return { kind: 'client', id: c.id };
  return null;
}
function deleteSelected(): void {
  if (!sel) return;
  scenario = { ...scenario, aps: scenario.aps.filter((a) => a.id !== sel!.id), clients: scenario.clients.filter((c) => c.id !== sel!.id) };
  sel = null; recs = []; refresh();
}
canvas.addEventListener('pointerdown', (e) => {
  const p = toModel(e), r2 = (v: number): number => Math.round(v * 10) / 10;
  const h = hit(p.x, p.y);
  if (mode === 'ap' && !h) {
    const ref = scenario.aps[0];
    const a: AccessPoint = { id: nextId('AP-', scenario.aps), x: r2(p.x), y: r2(p.y), txPowerDbm: ref?.txPowerDbm ?? 20, antennaGainDbi: ref?.antennaGainDbi ?? 2, freqMHz: ref?.freqMHz ?? 2437, channel: ref?.channel ?? 6, maxClients: ref?.maxClients ?? 30, costUsd: ref?.costUsd ?? 80 };
    scenario = { ...scenario, aps: [...scenario.aps, a] }; sel = { kind: 'ap', id: a.id }; recs = [];
  } else if (mode === 'client' && !h) {
    const c: Client = { id: nextId('C', scenario.clients), x: r2(p.x), y: r2(p.y), demandMbps: scenario.clients[0]?.demandMbps ?? 2 };
    scenario = { ...scenario, clients: [...scenario.clients, c] }; sel = { kind: 'client', id: c.id }; recs = [];
  } else { sel = h; dragging = !!h; if (h) canvas.setPointerCapture(e.pointerId); }
  refresh();
});
let raf = 0;
canvas.addEventListener('pointermove', (e) => {
  const p = toModel(e);
  if (dragging && sel) {
    const d = (sel.kind === 'ap' ? scenario.aps : scenario.clients).find((x) => x.id === sel!.id);
    if (d) { d.x = Math.min(scenario.config.widthM, Math.max(0, Math.round(p.x * 10) / 10)); d.y = Math.min(scenario.config.heightM, Math.max(0, Math.round(p.y * 10) / 10)); }
    cancelAnimationFrame(raf); raf = requestAnimationFrame(refresh); return;
  }
  if (!result) return;
  const q = inspectPoint(scenario, p.x, p.y);
  $('inspect').textContent = `(${p.x.toFixed(1)}, ${p.y.toFixed(1)}) m · RSSI ${q.rssiDbm.toFixed(0)} dBm · SNR ${q.snrDb.toFixed(0)} dB · SINR ${q.sinrDb.toFixed(0)} dB · best AP ${q.servingApId ?? '–'} · est. single-client throughput ${q.unloadedThroughputMbps.toFixed(1)} Mbps (estimate)`;
});
canvas.addEventListener('pointerup', () => { dragging = false; refresh(); });
window.addEventListener('keydown', (e) => { if (e.key === 'Delete' && !(e.target instanceof HTMLInputElement)) deleteSelected(); });
document.querySelectorAll<HTMLButtonElement>('.mode').forEach((b) => b.addEventListener('click', () => {
  mode = b.dataset.mode as typeof mode;
  document.querySelectorAll('.mode').forEach((x) => x.classList.toggle('on', x === b));
}));

/* ---------- scenario I/O, optimizer, snapshots ---------- */
const selEl = $('scenarioSelect') as HTMLSelectElement;
SCENARIO_DEFS.forEach((d, i) => selEl.add(new Option(d.name, String(i))));
$('loadBtn').onclick = () => { scenario = buildScenario(SCENARIO_DEFS[+selEl.value]); sel = null; recs = []; renderConfig(); refresh(); };
$('exportBtn').onclick = () => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(scenario, null, 2)], { type: 'application/json' }));
  a.download = 'scenario.json'; a.click(); URL.revokeObjectURL(a.href);
};
($('importFile') as HTMLInputElement).onchange = async (e) => {
  const file = (e.target as HTMLInputElement).files?.[0]; if (!file) return;
  try {
    const s = JSON.parse(await file.text()) as Scenario;
    const errs = validateScenario(s);
    if (errs.length) throw new Error(errs.join('; '));
    scenario = s; sel = null; recs = []; renderConfig(); refresh();
  } catch (err) { $('error').textContent = 'Import failed: ' + (err as Error).message; $('error').hidden = false; }
  (e.target as HTMLInputElement).value = '';
};
$('optBtn').onclick = () => {
  if (!metrics) return;
  recs = optimize(scenario, defaultOptimizerOptions(scenario)); $('recs').dataset.ran = '1'; refresh();
};
$('snapBtn').onclick = () => { if (metrics) { snaps.push({ name: `#${snaps.length + 1} ${scenario.name.slice(0, 14)}`, m: metrics }); renderCompare(); } };
$('clearSnaps').onclick = () => { snaps = []; renderCompare(); };

renderConfig();
refresh();
