/** Unit conversions. Power: W, mW, dBm. Frequency: Hz, MHz. */
export const dbmToMw = (dbm: number): number => Math.pow(10, dbm / 10);
export const mwToDbm = (mw: number): number => (mw <= 0 ? -Infinity : 10 * Math.log10(mw));
export const wattsToDbm = (w: number): number => mwToDbm(w * 1000);
export const dbmToWatts = (dbm: number): number => dbmToMw(dbm) / 1000;
export const mhzToHz = (mhz: number): number => mhz * 1e6;
export const hzToMhz = (hz: number): number => hz / 1e6;
