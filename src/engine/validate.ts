import type { Scenario } from './types';

export class InvalidScenarioError extends Error {
  constructor(public readonly errors: string[]) {
    super('Invalid scenario: ' + errors.join('; '));
    this.name = 'InvalidScenarioError';
  }
}

const fin = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Returns a list of human-readable problems; empty means the scenario is safe to simulate. */
export function validateScenario(s: Scenario): string[] {
  const e: string[] = [];
  const c = s?.config;
  if (!c || !Array.isArray(s.aps) || !Array.isArray(s.clients) || !Array.isArray(s.walls)) return ['Scenario is malformed'];
  if (!fin(c.widthM) || c.widthM <= 0) e.push('Area width must be > 0');
  if (!fin(c.heightM) || c.heightM <= 0) e.push('Area height must be > 0');
  if (!fin(c.bandwidthMHz) || c.bandwidthMHz <= 0) e.push('Bandwidth must be > 0');
  if (!fin(c.pathLossExponent) || c.pathLossExponent <= 0) e.push('Path-loss exponent must be > 0');
  if (!fin(c.refDistanceM) || c.refDistanceM <= 0) e.push('Reference distance must be > 0');
  if (!fin(c.noiseFigureDb) || c.noiseFigureDb < 0) e.push('Noise figure must be >= 0');
  if (!fin(c.protocolEfficiency) || c.protocolEfficiency <= 0 || c.protocolEfficiency > 1) e.push('Protocol efficiency must be in (0, 1]');
  for (const k of ['minRssiDbm', 'minSnrDb', 'clientAntennaGainDbi', 'minThroughputMbps'] as const)
    if (!fin(c[k])) e.push(`${k} must be a finite number`);
  if (c.model !== 'fspl' && c.model !== 'log-distance') e.push('Unknown path-loss model');
  const ids = new Set<string>();
  for (const a of s.aps) {
    if (ids.has(a.id)) e.push(`Duplicate id ${a.id}`);
    ids.add(a.id);
    if (![a.x, a.y, a.txPowerDbm, a.antennaGainDbi, a.channel, a.costUsd].every(fin)) e.push(`${a.id}: non-numeric field`);
    if (!fin(a.freqMHz) || a.freqMHz <= 0) e.push(`${a.id}: frequency must be > 0`);
    if (!fin(a.maxClients) || a.maxClients < 1) e.push(`${a.id}: max clients must be >= 1`);
  }
  for (const cl of s.clients) {
    if (ids.has(cl.id)) e.push(`Duplicate id ${cl.id}`);
    ids.add(cl.id);
    if (!fin(cl.x) || !fin(cl.y)) e.push(`${cl.id}: invalid position`);
    if (!fin(cl.demandMbps) || cl.demandMbps < 0) e.push(`${cl.id}: demand must be >= 0`);
  }
  for (const w of s.walls) if (![w.x1, w.y1, w.x2, w.y2, w.lossDb].every(fin) || w.lossDb < 0) e.push('Invalid wall');
  return e;
}
