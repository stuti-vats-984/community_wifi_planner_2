import type { AccessPoint, Client, Config, Scenario, Wall } from '../engine/types';

/** All parameters below are ILLUSTRATIVE. They do not describe any real deployment. */
export interface ClusterSpec { count: number; cx: number; cy: number; sigmaM: number; demandMbps: number }
export interface ScenarioDef {
  name: string; description: string; seed: number;
  config: Config; aps: AccessPoint[]; walls: Wall[]; clusters: ClusterSpec[];
}

const BASE: Config = {
  widthM: 40, heightM: 20, model: 'log-distance', pathLossExponent: 3.5, refDistanceM: 1,
  bandwidthMHz: 20, noiseFigureDb: 7, clientAntennaGainDbi: 0, minRssiDbm: -75, minSnrDb: 10,
  protocolEfficiency: 0.6, minThroughputMbps: 5,
};
const ap = (id: string, x: number, y: number, channel: number, extra: Partial<AccessPoint> = {}): AccessPoint => ({
  id, x, y, txPowerDbm: 20, antennaGainDbi: 2, freqMHz: 2407 + 5 * channel, channel, maxClients: 30, costUsd: 80, ...extra,
});

export const SCENARIO_DEFS: ScenarioDef[] = [
  {
    name: 'A. Small apartment block',
    description: 'Two APs, interior walls. Clients at the east end sit behind two walls and have weak links.',
    seed: 11, config: { ...BASE },
    aps: [ap('AP-1', 6, 10, 1), ap('AP-2', 18, 10, 6)],
    walls: [{ x1: 12, y1: 0, x2: 12, y2: 20, lossDb: 12 }, { x1: 26, y1: 0, x2: 26, y2: 20, lossDb: 12 }],
    clusters: [
      { count: 5, cx: 6, cy: 10, sigmaM: 3, demandMbps: 3 }, { count: 5, cx: 19, cy: 10, sigmaM: 3, demandMbps: 3 },
      { count: 5, cx: 34, cy: 10, sigmaM: 3, demandMbps: 3 },
    ],
  },
  {
    name: 'B. Community deployment',
    description: 'Open outdoor area (n=2.8), 3 APs, uneven client density; two APs share channel 1.',
    seed: 22,
    config: { ...BASE, widthM: 240, heightM: 160, pathLossExponent: 2.8, minThroughputMbps: 2 },
    aps: [ap('AP-1', 50, 50, 1, { antennaGainDbi: 6 }), ap('AP-2', 120, 100, 6, { antennaGainDbi: 6 }), ap('AP-3', 190, 50, 1, { antennaGainDbi: 6 })],
    walls: [],
    clusters: [
      { count: 14, cx: 60, cy: 55, sigmaM: 18, demandMbps: 2 }, { count: 10, cx: 130, cy: 95, sigmaM: 20, demandMbps: 2 },
      { count: 6, cx: 200, cy: 40, sigmaM: 15, demandMbps: 2 }, { count: 6, cx: 215, cy: 140, sigmaM: 10, demandMbps: 2 },
    ],
  },
  {
    name: 'C. Capacity-constrained',
    description: 'Strong signal everywhere, but 36 clients at 4 Mbps overload two APs (airtime, not coverage, is the limit).',
    seed: 33, config: { ...BASE, widthM: 30, heightM: 20, pathLossExponent: 3.0 },
    aps: [ap('AP-1', 8, 10, 1), ap('AP-2', 22, 10, 6)],
    walls: [],
    clusters: [{ count: 18, cx: 9, cy: 10, sigmaM: 4, demandMbps: 4 }, { count: 18, cx: 21, cy: 10, sigmaM: 4, demandMbps: 4 }],
  },
];

/** Deterministic PRNG (mulberry32) so scenarios are reproducible from their seed. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildScenario(def: ScenarioDef): Scenario {
  const rnd = mulberry32(def.seed);
  const gauss = (): number => Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(2 * Math.PI * rnd());
  const clamp = (v: number, hi: number): number => Math.round(Math.min(hi, Math.max(0, v)) * 10) / 10;
  const clients: Client[] = [];
  for (const c of def.clusters)
    for (let i = 0; i < c.count; i++)
      clients.push({
        id: `C${String(clients.length + 1).padStart(2, '0')}`,
        x: clamp(c.cx + c.sigmaM * gauss(), def.config.widthM), y: clamp(c.cy + c.sigmaM * gauss(), def.config.heightM),
        demandMbps: c.demandMbps,
      });
  return JSON.parse(JSON.stringify({ name: def.name, description: def.description, config: def.config, aps: def.aps, clients, walls: def.walls }));
}
