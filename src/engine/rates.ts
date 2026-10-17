/**
 * Illustrative SINR -> PHY rate table for a 20 MHz, single-spatial-stream OFDM link.
 * Loosely inspired by 802.11n/ac MCS 0-8 but NOT standards-accurate: thresholds are
 * round numbers chosen for transparency. Rate scales linearly with bandwidth/20 MHz.
 */
export const RATE_TABLE_20MHZ: ReadonlyArray<{ minSinrDb: number; rateMbps: number }> = [
  { minSinrDb: 2, rateMbps: 6.5 }, { minSinrDb: 5, rateMbps: 13 }, { minSinrDb: 9, rateMbps: 19.5 },
  { minSinrDb: 11, rateMbps: 26 }, { minSinrDb: 15, rateMbps: 39 }, { minSinrDb: 18, rateMbps: 52 },
  { minSinrDb: 20, rateMbps: 58.5 }, { minSinrDb: 25, rateMbps: 65 }, { minSinrDb: 29, rateMbps: 78 },
];

/** Highest table entry whose SINR threshold is met; 0 if the link is unusable. */
export function phyRateMbps(sinrDb: number, bandwidthMHz: number): number {
  let rate = 0;
  for (const e of RATE_TABLE_20MHZ) if (sinrDb >= e.minSinrDb) rate = e.rateMbps;
  return rate * (bandwidthMHz / 20);
}
