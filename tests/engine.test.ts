import { describe, expect, it } from 'vitest';
import {
  computeHeatmap, computeMetrics, dbmToMw, dbmToWatts, defaultOptimizerOptions, fsplDb, hzToMhz, inspectPoint,
  InvalidScenarioError, logDistancePathLossDb, mhzToHz, mwToDbm, optimize, phyRateMbps, receivedPowerDbm, simulate,
  thermalNoiseDbm, wallLossDb, wattsToDbm, linkRssiDbm, type AccessPoint, type Client, type Scenario,
} from '../src/engine';
import { SCENARIO_DEFS, buildScenario } from '../src/data/scenarios';

const ap = (id: string, x: number, y: number, o: Partial<AccessPoint> = {}): AccessPoint => ({
  id, x, y, txPowerDbm: 20, antennaGainDbi: 2, freqMHz: 2437, channel: 6, maxClients: 30, costUsd: 80, ...o,
});
const cl = (id: string, x: number, y: number, demandMbps = 2): Client => ({ id, x, y, demandMbps });
const make = (aps: AccessPoint[], clients: Client[], cfg: Partial<Scenario['config']> = {}, walls: Scenario['walls'] = []): Scenario => ({
  name: 't', walls, aps, clients,
  config: {
    widthM: 100, heightM: 100, model: 'log-distance', pathLossExponent: 3, refDistanceM: 1, bandwidthMHz: 20,
    noiseFigureDb: 7, clientAntennaGainDbi: 0, minRssiDbm: -75, minSnrDb: 10, protocolEfficiency: 0.6, minThroughputMbps: 5, ...cfg,
  },
});

describe('units', () => {
  it('converts W / mW / dBm / Hz / MHz', () => {
    expect(dbmToMw(20)).toBeCloseTo(100, 9);
    expect(wattsToDbm(1)).toBeCloseTo(30, 9);
    expect(dbmToWatts(30)).toBeCloseTo(1, 9);
    expect(mwToDbm(dbmToMw(-47.3))).toBeCloseTo(-47.3, 9);
    expect(hzToMhz(mhzToHz(2437))).toBeCloseTo(2437, 9);
  });
});

describe('propagation: analytical checks', () => {
  it('FSPL(2437 MHz, 100 m) = 32.44 + 67.737 - 20 = 80.18 dB (hand calc)', () => {
    expect(fsplDb(2437, 100)).toBeCloseTo(80.177, 2);
  });
  it('FSPL(2400 MHz, 1 km) = 100.04 dB', () => expect(fsplDb(2400, 1000)).toBeCloseTo(100.04, 2));
  it('FSPL increases with distance and frequency; +6.02 dB per doubled distance', () => {
    expect(fsplDb(2437, 50)).toBeLessThan(fsplDb(2437, 100));
    expect(fsplDb(2437, 100)).toBeLessThan(fsplDb(5180, 100));
    expect(fsplDb(2437, 200) - fsplDb(2437, 100)).toBeCloseTo(6.0206, 3);
  });
  it('5 GHz loses ~6.6 dB more than 2.4 GHz at the same distance (20log10(5180/2437))', () => {
    expect(fsplDb(5180, 50) - fsplDb(2437, 50)).toBeCloseTo(20 * Math.log10(5180 / 2437), 6);
  });
  it('log-distance equals FSPL at d0 and for n = 2; steeper n gives more loss', () => {
    expect(logDistancePathLossDb(2437, 1, 3, 1)).toBeCloseTo(fsplDb(2437, 1), 9);
    expect(logDistancePathLossDb(2437, 80, 2, 1)).toBeCloseTo(fsplDb(2437, 80), 9);
    expect(logDistancePathLossDb(2437, 80, 3.5)).toBeGreaterThan(logDistancePathLossDb(2437, 80, 3));
  });
  it('thermal noise: 20 MHz -> -100.99 dBm (NF 0), +NF shifts 1:1; 40 MHz is +3.01 dB', () => {
    expect(thermalNoiseDbm(20, 0)).toBeCloseTo(-100.99, 2);
    expect(thermalNoiseDbm(20, 7)).toBeCloseTo(-93.99, 2);
    expect(thermalNoiseDbm(40, 0) - thermalNoiseDbm(20, 0)).toBeCloseTo(3.0103, 3);
  });
  it('link budget: 20 dBm + 2 dBi - 80.18 dB = -58.18 dBm; higher path loss lowers Prx', () => {
    expect(receivedPowerDbm(20, 2, 0, fsplDb(2437, 100))).toBeCloseTo(-58.177, 2);
    expect(receivedPowerDbm(20, 2, 0, 90)).toBeLessThan(receivedPowerDbm(20, 2, 0, 80));
  });
  it('SNR = Prx - noise (hand example: -58.18 - (-93.99) = 35.81 dB)', () => {
    const s = make([ap('A', 0, 0)], [cl('c', 100, 0)], { model: 'fspl' });
    const r = simulate(s).clients[0];
    expect(r.snrDb).toBeCloseTo(-58.177 + 93.99, 1);
  });
  it('walls add loss only when crossed', () => {
    const w = [{ x1: 5, y1: -5, x2: 5, y2: 5, lossDb: 12 }];
    expect(wallLossDb(0, 0, 10, 0, w)).toBe(12);
    expect(wallLossDb(0, 0, 4, 0, w)).toBe(0);
    expect(wallLossDb(0, 0, 10, 0, [...w, ...w])).toBe(24);
  });
});

describe('rates', () => {
  it('is monotonic in SINR, 0 below threshold, scales with bandwidth', () => {
    expect(phyRateMbps(1, 20)).toBe(0);
    expect(phyRateMbps(30, 20)).toBeGreaterThan(phyRateMbps(12, 20));
    expect(phyRateMbps(30, 40)).toBeCloseTo(2 * phyRateMbps(30, 20), 9);
  });
});

describe('association', () => {
  it('client below the RSSI threshold is not associated and reports a reason', () => {
    const s = make([ap('A', 0, 0)], [cl('near', 5, 0), cl('far', 100, 100)]);
    const r = simulate(s);
    expect(r.clients[0].servingApId).toBe('A');
    expect(r.clients[1].servingApId).toBeNull();
    expect(r.clients[1].failure).toBe('below_threshold');
    expect(r.clients[1].meetsSignal).toBe(false);
  });
  it('signal below the noise floor reports no_ap_in_range; no APs at all too', () => {
    const far = make([ap('A', 0, 0)], [cl('x', 100, 100)], { pathLossExponent: 6 });
    expect(simulate(far).clients[0].failure).toBe('no_ap_in_range');
    expect(simulate(make([], [cl('x', 1, 1)])).clients[0].failure).toBe('no_ap_in_range');
  });
  it('respects maxClients and reports ap_full', () => {
    const s = make([ap('A', 50, 50, { maxClients: 2 })], [cl('1', 51, 50), cl('2', 52, 50), cl('3', 53, 50), cl('4', 54, 50)]);
    const r = simulate(s);
    expect(r.aps[0].clientIds.length).toBe(2);
    expect(r.clients.filter((c) => c.failure === 'ap_full').length).toBe(2);
    expect(r.clients.filter((c) => c.failure === 'ap_full').every((c) => c.meetsSignal)).toBe(true); // in coverage, not associated
  });
  it('overflow client falls back to the next eligible AP', () => {
    const s = make([ap('A', 50, 50, { maxClients: 1 }), ap('B', 60, 50, { channel: 1, freqMHz: 2412 })], [cl('1', 52, 50), cl('2', 53, 50)]);
    expect(simulate(s).clients.map((c) => c.servingApId).sort()).toEqual(['A', 'B']);
  });
});

describe('interference (SINR)', () => {
  const clientAt = cl('c', 40, 50);
  it('co-channel SINR matches the linear-unit hand calculation', () => {
    const s = make([ap('A', 30, 50), ap('B', 70, 50)], [clientAt]);
    const r = simulate(s);
    const sMw = dbmToMw(linkRssiDbm(s, s.aps[0], 40, 50));
    const iMw = dbmToMw(linkRssiDbm(s, s.aps[1], 40, 50));
    const nMw = dbmToMw(thermalNoiseDbm(20, 7));
    expect(r.clients[0].sinrDb).toBeCloseTo(10 * Math.log10(sMw / (iMw + nMw)), 6);
    expect(r.clients[0].sinrDb as number).toBeLessThan(r.clients[0].snrDb as number);
  });
  it('different channels: SINR == SNR', () => {
    const s = make([ap('A', 30, 50), ap('B', 70, 50, { channel: 1, freqMHz: 2412 })], [clientAt]);
    const c = simulate(s).clients[0];
    expect(c.sinrDb).toBeCloseTo(c.snrDb as number, 6);
  });
});

describe('capacity and throughput', () => {
  const crowded = make([ap('A', 50, 50)], Array.from({ length: 12 }, (_, i) => cl(`c${i}`, 50 + i * 0.5, 52, 10)));
  it('never delivers more than demand, airtime <= 1, and AP throughput <= modeled capacity', () => {
    const r = simulate(crowded);
    expect(r.aps[0].servedAirtime).toBeLessThanOrEqual(1 + 1e-9);
    expect(r.aps[0].deliveredMbps).toBeLessThanOrEqual(r.aps[0].capacityMbps + 1e-9);
    for (const c of r.clients) { expect(c.deliveredMbps).toBeLessThanOrEqual(c.demandMbps + 1e-9); expect(c.unmetMbps).toBeCloseTo(c.demandMbps - c.deliveredMbps, 9); }
  });
  it('flags an overloaded AP and does not flag a lightly loaded one', () => {
    expect(simulate(crowded).aps[0].overloaded).toBe(true);
    expect(simulate(make([ap('A', 50, 50)], [cl('a', 52, 50, 1)])).aps[0].overloaded).toBe(false);
  });
  it('max-min fairness: a small flow is fully served while big flows share the remainder', () => {
    const s = make([ap('A', 50, 50)], [cl('small', 51, 50, 1), cl('b1', 52, 50, 100), cl('b2', 53, 50, 100)]);
    const r = simulate(s);
    expect(r.clients[0].deliveredMbps).toBeCloseTo(1, 9);
    expect(r.clients[1].deliveredMbps).toBeCloseTo(r.clients[2].deliveredMbps, 6);
  });
  it('uncongested client gets exactly its demand', () => {
    expect(simulate(make([ap('A', 50, 50)], [cl('a', 52, 50, 3)])).clients[0].deliveredMbps).toBeCloseTo(3, 9);
  });
});

describe('metrics, determinism, validation', () => {
  it('metrics agree with per-client / per-AP results', () => {
    const s = buildScenario(SCENARIO_DEFS[1]);
    const r = simulate(s), m = computeMetrics(s, r);
    expect(m.totalClients).toBe(r.clients.length);
    expect(m.associatedClients).toBe(r.clients.filter((c) => c.servingApId).length);
    expect(m.associatedClients + m.disconnectedClients).toBe(m.totalClients);
    expect(m.aggregateThroughputMbps).toBeCloseTo(r.aps.reduce((t, a) => t + a.deliveredMbps, 0), 9);
    expect(m.overloadedAps).toBe(r.aps.filter((a) => a.overloaded).length);
    expect(m.pctMeetingThroughput).toBeCloseTo((100 * r.clients.filter((c) => c.meetsThroughput).length) / m.totalClients, 9);
    expect(m.equipmentCostUsd).toBe(s.aps.length * 80);
  });
  it('repeated simulations are identical (and scenario generation is seeded)', () => {
    const a = buildScenario(SCENARIO_DEFS[1]), b = buildScenario(SCENARIO_DEFS[1]);
    expect(a).toEqual(b);
    expect(JSON.stringify(simulate(a))).toBe(JSON.stringify(simulate(b)));
  });
  it('rejects invalid input safely', () => {
    expect(() => fsplDb(-1, 10)).toThrow(RangeError);
    expect(() => fsplDb(2437, NaN)).toThrow(RangeError);
    expect(() => thermalNoiseDbm(0, 7)).toThrow(RangeError);
    expect(() => simulate(make([ap('A', 0, 0, { freqMHz: 0 })], []))).toThrow(InvalidScenarioError);
    expect(() => simulate(make([], [], { widthM: -5 }))).toThrow(InvalidScenarioError);
    expect(() => simulate(make([ap('A', 0, 0)], [cl('c', NaN, 0)]))).toThrow(InvalidScenarioError);
    expect(() => simulate(make([ap('A', 0, 0), ap('A', 1, 1)], []))).toThrow(InvalidScenarioError);
  });
  it('built-in scenarios simulate and show their intended trade-offs', () => {
    const [a, b, c] = SCENARIO_DEFS.map((d) => { const s = buildScenario(d); return computeMetrics(s, simulate(s)); });
    expect(a.pctMeetingSignal).toBeLessThan(100);            // weak links behind walls
    expect(c.pctMeetingSignal).toBe(100);                    // coverage fine ...
    expect(c.overloadedAps).toBeGreaterThan(0);              // ... capacity is the limit
    expect(b.totalClients).toBeGreaterThan(a.totalClients);
  });
});

describe('heatmap', () => {
  it('cell values equal the link budget at the cell centre (best server) and fall with distance', () => {
    const s = make([ap('A', 10, 50)], [], { widthM: 100, heightM: 100 });
    const h = computeHeatmap(s, 10, 10);
    const cx = 0.5 * h.cellW, cy = 5.5 * h.cellH;
    expect(h.rssiDbm[5 * 10 + 0]).toBeCloseTo(linkRssiDbm(s, s.aps[0], cx, cy), 3);
    expect(h.rssiDbm[5 * 10 + 9]).toBeLessThan(h.rssiDbm[5 * 10 + 0]);
  });
  it('inspectPoint agrees with simulate() for an isolated client', () => {
    const s = make([ap('A', 20, 20)], [cl('c', 35, 28)]);
    const p = inspectPoint(s, 35, 28), c = simulate(s).clients[0];
    expect(p.rssiDbm).toBeCloseTo(c.rssiDbm as number, 6);
    expect(p.sinrDb).toBeCloseTo(c.sinrDb as number, 6);
    expect(p.servingApId).toBe('A');
  });
});

describe('optimizer', () => {
  it('is deterministic and measurably improves scenario A (coverage) and C (capacity)', () => {
    for (const idx of [0, 2]) {
      const s = buildScenario(SCENARIO_DEFS[idx]);
      const opt = defaultOptimizerOptions(s);
      const r1 = optimize(s, opt), r2 = optimize(s, opt);
      expect(JSON.stringify(r1)).toBe(JSON.stringify(r2));
      expect(r1.length).toBeGreaterThan(0);
      const first = r1[0], last = r1[r1.length - 1];
      expect(last.scoreAfter).toBeGreaterThan(first.scoreBefore);
      expect(last.after.pctMeetingThroughput).toBeGreaterThan(first.before.pctMeetingThroughput);
    }
  });
  it('after-metrics equal a fresh simulation of the recommended scenario', () => {
    const s = buildScenario(SCENARIO_DEFS[0]);
    const [rec] = optimize(s, defaultOptimizerOptions(s));
    const applied = { ...s, aps: [...s.aps, rec.ap] };
    expect(computeMetrics(applied, simulate(applied))).toEqual(rec.after);
  });
  it('returns nothing when the target is already met', () => {
    const s = make([ap('A', 50, 50)], [cl('c', 52, 50, 1)]);
    expect(optimize(s, defaultOptimizerOptions(s))).toEqual([]);
  });
});
