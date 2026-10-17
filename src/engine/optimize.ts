import type { AccessPoint, Scenario } from './types';
import { computeMetrics, type Metrics } from './metrics';
import { simulate } from './simulate';

export interface Weights { signal: number; throughput: number; overloaded: number; cost: number }
export interface ApTemplate { txPowerDbm: number; antennaGainDbi: number; freqMHz: number; maxClients: number; costUsd: number; channels: number[] }
export interface OptimizerOptions { gridStepM: number; maxNewAps: number; targetServicePct: number; weights: Weights; template: ApTemplate }
export interface Recommendation { step: number; ap: AccessPoint; before: Metrics; after: Metrics; scoreBefore: number; scoreAfter: number }

/**
 * Objective (higher is better):
 *   score = w.signal * %meetingSignal + w.throughput * %meetingThroughput
 *         - w.overloaded * overloadedAPs - w.cost * equipmentCostUsd
 */
export function scoreMetrics(m: Metrics, w: Weights): number {
  return w.signal * m.pctMeetingSignal + w.throughput * m.pctMeetingThroughput - w.overloaded * m.overloadedAps - w.cost * m.equipmentCostUsd;
}

export function defaultOptimizerOptions(s: Scenario): OptimizerOptions {
  const ref = s.aps[0];
  return {
    gridStepM: Math.max(2, Math.round(Math.max(s.config.widthM, s.config.heightM) / 20)),
    maxNewAps: 4, targetServicePct: 95,
    weights: { signal: 1, throughput: 1, overloaded: 10, cost: 0.01 },
    template: {
      txPowerDbm: ref?.txPowerDbm ?? 20, antennaGainDbi: ref?.antennaGainDbi ?? 2, freqMHz: ref?.freqMHz ?? 2437,
      maxClients: ref?.maxClients ?? 30, costUsd: ref?.costUsd ?? 80, channels: [1, 6, 11],
    },
  };
}

/**
 * Bounded greedy AP placement. Each step evaluates every (grid cell centre x channel) candidate with the
 * full simulator and keeps the best objective score. Deterministic: candidates are scanned in x, y, channel
 * order and only a strictly better score replaces the incumbent, so ties go to the lowest x, then y, then channel.
 * Stops at the target service level, the AP budget, or when no candidate improves the score.
 * Limitations: greedy (not globally optimal), only adds APs, positions limited to the grid.
 */
export function optimize(s: Scenario, opt: OptimizerOptions): Recommendation[] {
  const recs: Recommendation[] = [];
  let current = s;
  let currentMetrics = computeMetrics(current, simulate(current));
  const eps = 1e-9;
  const { channels, ...apFields } = opt.template;
  for (let step = 1; step <= opt.maxNewAps; step++) {
    if (Math.min(currentMetrics.pctMeetingSignal, currentMetrics.pctMeetingThroughput) >= opt.targetServicePct) break;
    const baseScore = scoreMetrics(currentMetrics, opt.weights);
    let best: { ap: AccessPoint; sc: Scenario; m: Metrics; score: number } | null = null;
    for (let x = opt.gridStepM / 2; x < s.config.widthM; x += opt.gridStepM)
      for (let y = opt.gridStepM / 2; y < s.config.heightM; y += opt.gridStepM)
        for (const channel of channels) {
          const ap: AccessPoint = { id: `AP-opt-${step}`, x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100, channel, ...apFields };
          const sc: Scenario = { ...current, aps: [...current.aps, ap] };
          const m = computeMetrics(sc, simulate(sc));
          const score = scoreMetrics(m, opt.weights);
          if (!best || score > best.score + eps) best = { ap, sc, m, score };
        }
    if (!best || best.score <= baseScore + eps) break;
    recs.push({ step, ap: best.ap, before: currentMetrics, after: best.m, scoreBefore: baseScore, scoreAfter: best.score });
    current = best.sc;
    currentMetrics = best.m;
  }
  return recs;
}
