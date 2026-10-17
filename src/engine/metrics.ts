import type { Scenario, SimulationResult } from './types';

export interface Metrics {
  apCount: number; totalClients: number; associatedClients: number; disconnectedClients: number;
  pctMeetingSignal: number; pctMeetingThroughput: number;
  meanRssiDbm: number | null; worstRssiDbm: number | null;
  meanSinrDb: number | null; worstSinrDb: number | null;
  aggregateThroughputMbps: number; aggregateDemandMbps: number;
  overloadedAps: number; equipmentCostUsd: number;
}

const mean = (v: number[]): number | null => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : null);
const min = (v: number[]): number | null => (v.length ? Math.min(...v) : null);

/** Pure function of the simulation result. RSSI/SINR stats cover associated clients only. */
export function computeMetrics(s: Scenario, r: SimulationResult): Metrics {
  const n = r.clients.length;
  const assoc = r.clients.filter((c) => c.servingApId !== null);
  const rssi = assoc.map((c) => c.rssiDbm as number);
  const sinr = assoc.map((c) => c.sinrDb as number);
  const pct = (k: number): number => (n ? (100 * k) / n : 0);
  return {
    apCount: s.aps.length, totalClients: n, associatedClients: assoc.length, disconnectedClients: n - assoc.length,
    pctMeetingSignal: pct(r.clients.filter((c) => c.meetsSignal).length),
    pctMeetingThroughput: pct(r.clients.filter((c) => c.meetsThroughput).length),
    meanRssiDbm: mean(rssi), worstRssiDbm: min(rssi), meanSinrDb: mean(sinr), worstSinrDb: min(sinr),
    aggregateThroughputMbps: r.clients.reduce((t, c) => t + c.deliveredMbps, 0),
    aggregateDemandMbps: r.clients.reduce((t, c) => t + c.demandMbps, 0),
    overloadedAps: r.aps.filter((a) => a.overloaded).length,
    equipmentCostUsd: s.aps.reduce((t, a) => t + a.costUsd, 0),
  };
}
