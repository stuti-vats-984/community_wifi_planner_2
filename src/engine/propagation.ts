import type { Config, Wall } from './types';
import { mhzToHz } from './units';

/** Distances below this are clamped to avoid log10(0) and near-field nonsense. */
export const MIN_DISTANCE_M = 1;

function requirePositive(name: string, v: number): void {
  if (!Number.isFinite(v) || v <= 0) throw new RangeError(`${name} must be a positive finite number (got ${v})`);
}

/** Free-space path loss: 32.44 + 20log10(f_MHz) + 20log10(d_km). */
export function fsplDb(freqMHz: number, distanceM: number): number {
  requirePositive('freqMHz', freqMHz);
  if (!Number.isFinite(distanceM) || distanceM < 0) throw new RangeError(`distanceM must be >= 0 (got ${distanceM})`);
  const d = Math.max(distanceM, MIN_DISTANCE_M);
  return 32.44 + 20 * Math.log10(freqMHz) + 20 * Math.log10(d / 1000);
}

/**
 * Log-distance path loss: PL(d) = PL(d0) + 10 n log10(d/d0), with PL(d0) = FSPL(d0).
 * Using FSPL at d0 as the reference anchors the model to a physical value
 * (n = 2 reproduces FSPL exactly).
 */
export function logDistancePathLossDb(freqMHz: number, distanceM: number, exponent: number, refDistanceM = 1): number {
  requirePositive('exponent', exponent);
  requirePositive('refDistanceM', refDistanceM);
  const d = Math.max(distanceM, refDistanceM);
  return fsplDb(freqMHz, refDistanceM) + 10 * exponent * Math.log10(d / refDistanceM);
}

export function pathLossDb(config: Config, freqMHz: number, distanceM: number): number {
  return config.model === 'fspl'
    ? fsplDb(freqMHz, distanceM)
    : logDistancePathLossDb(freqMHz, distanceM, config.pathLossExponent, config.refDistanceM);
}

function orient(ax: number, ay: number, bx: number, by: number, cx: number, cy: number): number {
  return Math.sign((bx - ax) * (cy - ay) - (by - ay) * (cx - ax));
}

/** True if segment AB properly crosses the wall segment (touching/collinear cases ignored). */
export function segmentsCross(ax: number, ay: number, bx: number, by: number, w: Wall): boolean {
  const o1 = orient(ax, ay, bx, by, w.x1, w.y1), o2 = orient(ax, ay, bx, by, w.x2, w.y2);
  const o3 = orient(w.x1, w.y1, w.x2, w.y2, ax, ay), o4 = orient(w.x1, w.y1, w.x2, w.y2, bx, by);
  return o1 * o2 < 0 && o3 * o4 < 0;
}

/** Wall model: each wall crossed by the straight TX-RX line adds a fixed loss (dB). No reflection/diffraction. */
export function wallLossDb(ax: number, ay: number, bx: number, by: number, walls: Wall[]): number {
  let total = 0;
  for (const w of walls) if (segmentsCross(ax, ay, bx, by, w)) total += w.lossDb;
  return total;
}

/** Thermal noise floor: -174 dBm/Hz + 10log10(B_Hz) + NF. */
export function thermalNoiseDbm(bandwidthMHz: number, noiseFigureDb: number): number {
  requirePositive('bandwidthMHz', bandwidthMHz);
  return -174 + 10 * Math.log10(mhzToHz(bandwidthMHz)) + noiseFigureDb;
}

/** Link budget: Prx = Ptx + Gtx + Grx - PL - wallLoss (all dB / dBm). */
export function receivedPowerDbm(txDbm: number, txGainDbi: number, rxGainDbi: number, pathLoss: number, wallLoss = 0): number {
  return txDbm + txGainDbi + rxGainDbi - pathLoss - wallLoss;
}
