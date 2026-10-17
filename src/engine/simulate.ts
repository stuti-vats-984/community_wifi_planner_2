import type { AccessPoint, ApResult, ClientResult, FailureReason, Scenario, SimulationResult } from './types';
import { dbmToMw, mwToDbm } from './units';
import { pathLossDb, receivedPowerDbm, thermalNoiseDbm, wallLossDb } from './propagation';
import { phyRateMbps } from './rates';
import { InvalidScenarioError, validateScenario } from './validate';

/** Sentinel for "no AP exists" so arithmetic stays finite. */
export const NO_SIGNAL_DBM = -200;

/** RSSI (dBm) at point (x, y) from one AP: path loss + wall loss + antenna gains. */
export function linkRssiDbm(s: Scenario, ap: AccessPoint, x: number, y: number): number {
  const d = Math.hypot(ap.x - x, ap.y - y);
  const pl = pathLossDb(s.config, ap.freqMHz, d);
  const walls = wallLossDb(ap.x, ap.y, x, y, s.walls);
  return receivedPowerDbm(ap.txPowerDbm, ap.antennaGainDbi, s.config.clientAntennaGainDbi, pl, walls);
}

/** Two APs interfere only if they share frequency and channel number (adjacent-channel leakage is ignored). */
export const isCoChannel = (a: AccessPoint, b: AccessPoint): boolean => a.freqMHz === b.freqMHz && a.channel === b.channel;

/**
 * Full deterministic simulation. Pipeline:
 * 1 link budget -> 2 greedy association (strongest clients first) -> 3 SINR with worst-case
 * co-channel interference (interferers assumed always transmitting) -> 4 PHY rate lookup ->
 * 5 max-min fair airtime sharing per AP -> per-client / per-AP results.
 */
export function simulate(s: Scenario): SimulationResult {
  const errors = validateScenario(s);
  if (errors.length) throw new InvalidScenarioError(errors);
  const { config: cfg, aps, clients } = s;
  const noiseDbm = thermalNoiseDbm(cfg.bandwidthMHz, cfg.noiseFigureDb);
  const noiseMw = dbmToMw(noiseDbm);
  const rssi = clients.map((c) => aps.map((ap) => linkRssiDbm(s, ap, c.x, c.y)));
  const ranked = rssi.map((row) => row.map((_, j) => j).sort((a, b) => row[b] - row[a] || a - b));
  const bestRssi = (i: number): number => (ranked[i].length ? rssi[i][ranked[i][0]] : NO_SIGNAL_DBM);

  // Association order: strongest best-server first (ties by input order). Greedy and order-dependent by design.
  const order = clients.map((_, i) => i).sort((a, b) => bestRssi(b) - bestRssi(a) || a - b);
  const serving: number[] = clients.map(() => -1);
  const failure: (FailureReason | null)[] = clients.map(() => null);
  const load: number[][] = aps.map(() => []);
  for (const i of order) {
    if (!ranked[i].length) { failure[i] = 'no_ap_in_range'; continue; }
    const ok = ranked[i].filter((j) => rssi[i][j] >= cfg.minRssiDbm && rssi[i][j] - noiseDbm >= cfg.minSnrDb);
    if (!ok.length) { failure[i] = bestRssi(i) - noiseDbm < 0 ? 'no_ap_in_range' : 'below_threshold'; continue; }
    const pick = ok.find((j) => load[j].length < aps[j].maxClients);
    if (pick === undefined) { failure[i] = 'ap_full'; continue; }
    serving[i] = pick;
    load[pick].push(i);
  }

  // SINR and PHY rate for associated clients.
  const sinr: (number | null)[] = clients.map(() => null);
  const rate: number[] = clients.map(() => 0);
  clients.forEach((_, i) => {
    const j = serving[i];
    if (j < 0) return;
    let interfMw = 0;
    aps.forEach((other, k) => { if (k !== j && isCoChannel(aps[j], other)) interfMw += dbmToMw(rssi[i][k]); });
    sinr[i] = mwToDbm(dbmToMw(rssi[i][j]) / (interfMw + noiseMw));
    rate[i] = phyRateMbps(sinr[i] as number, cfg.bandwidthMHz);
  });

  // Airtime sharing per AP. need_i = demand / (eff * rate). Max-min fair water-filling over airtime.
  const delivered: number[] = clients.map(() => 0);
  const apResults: ApResult[] = aps.map((ap, j) => {
    const usable = load[j].filter((i) => rate[i] > 0 && clients[i].demandMbps > 0);
    const need = (i: number): number => clients[i].demandMbps / (cfg.protocolEfficiency * rate[i]);
    const sorted = [...usable].sort((a, b) => need(a) - need(b) || a - b);
    let remaining = 1, served = 0, demanded = 0;
    sorted.forEach((i, k) => {
      const share = remaining / (sorted.length - k);
      const a = Math.min(need(i), share);
      remaining -= a; served += a; demanded += need(i);
      delivered[i] = Math.min(a * cfg.protocolEfficiency * rate[i], clients[i].demandMbps);
    });
    const maxRate = Math.max(0, ...load[j].map((i) => rate[i]));
    return {
      id: ap.id, clientIds: load[j].map((i) => clients[i].id),
      demandedAirtime: demanded, servedAirtime: served,
      capacityMbps: cfg.protocolEfficiency * maxRate,
      deliveredMbps: load[j].reduce((t, i) => t + delivered[i], 0),
      overloaded: demanded > 1 + 1e-9,
    };
  });

  const clientResults: ClientResult[] = clients.map((c, i) => {
    const b = ranked[i].length ? ranked[i][0] : -1;
    const bSnr = bestRssi(i) - noiseDbm;
    const j = serving[i];
    const req = Math.min(c.demandMbps, cfg.minThroughputMbps);
    return {
      id: c.id, bestApId: b >= 0 ? aps[b].id : null, bestRssiDbm: bestRssi(i), bestSnrDb: bSnr,
      servingApId: j >= 0 ? aps[j].id : null,
      rssiDbm: j >= 0 ? rssi[i][j] : null, snrDb: j >= 0 ? rssi[i][j] - noiseDbm : null, sinrDb: sinr[i],
      phyRateMbps: rate[i], demandMbps: c.demandMbps, deliveredMbps: delivered[i],
      unmetMbps: Math.max(0, c.demandMbps - delivered[i]), failure: failure[i],
      meetsSignal: bestRssi(i) >= cfg.minRssiDbm && bSnr >= cfg.minSnrDb,
      meetsThroughput: j >= 0 && delivered[i] >= req - 1e-9,
    };
  });
  return { noiseDbm, clients: clientResults, aps: apResults };
}
