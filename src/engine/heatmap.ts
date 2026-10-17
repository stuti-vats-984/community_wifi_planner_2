import type { Scenario } from './types';
import { dbmToMw, mwToDbm } from './units';
import { isCoChannel, linkRssiDbm, NO_SIGNAL_DBM } from './simulate';
import { phyRateMbps } from './rates';
import { thermalNoiseDbm } from './propagation';

export interface Heatmap { cols: number; rows: number; cellW: number; cellH: number; rssiDbm: Float32Array }

/** Best-server RSSI at each cell centre, computed from the propagation model (row-major, y down). */
export function computeHeatmap(s: Scenario, cols: number, rows: number): Heatmap {
  const cellW = s.config.widthM / cols, cellH = s.config.heightM / rows;
  const rssiDbm = new Float32Array(cols * rows);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const x = (c + 0.5) * cellW, y = (r + 0.5) * cellH;
    let best = NO_SIGNAL_DBM;
    for (const ap of s.aps) best = Math.max(best, linkRssiDbm(s, ap, x, y));
    rssiDbm[r * cols + c] = best;
  }
  return { cols, rows, cellW, cellH, rssiDbm };
}

export interface PointEstimate {
  rssiDbm: number; snrDb: number; sinrDb: number; servingApId: string | null;
  phyRateMbps: number; unloadedThroughputMbps: number;
}

/** Point probe: best-server RSSI/SNR/SINR and the throughput a single, otherwise-idle client would see. */
export function inspectPoint(s: Scenario, x: number, y: number): PointEstimate {
  const noise = thermalNoiseDbm(s.config.bandwidthMHz, s.config.noiseFigureDb);
  let bi = -1, best = NO_SIGNAL_DBM;
  const rx = s.aps.map((ap) => linkRssiDbm(s, ap, x, y));
  rx.forEach((v, i) => { if (v > best) { best = v; bi = i; } });
  if (bi < 0) return { rssiDbm: best, snrDb: best - noise, sinrDb: best - noise, servingApId: null, phyRateMbps: 0, unloadedThroughputMbps: 0 };
  let interf = 0;
  s.aps.forEach((o, i) => { if (i !== bi && isCoChannel(s.aps[bi], o)) interf += dbmToMw(rx[i]); });
  const sinrDb = mwToDbm(dbmToMw(best) / (interf + dbmToMw(noise)));
  const rate = best >= s.config.minRssiDbm ? phyRateMbps(sinrDb, s.config.bandwidthMHz) : 0;
  return { rssiDbm: best, snrDb: best - noise, sinrDb, servingApId: s.aps[bi].id, phyRateMbps: rate, unloadedThroughputMbps: rate * s.config.protocolEfficiency };
}
