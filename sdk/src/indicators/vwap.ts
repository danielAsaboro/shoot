import type { Bar } from "../core/types.js";

/**
 * Compute running VWAP from an array of bars.
 * Typical price = (high + low + close) / 3.
 * VWAP[i] = cumSum(typicalPrice * volume) / cumSum(volume).
 * Bars with zero volume are included but don't shift the VWAP.
 */
export function computeVWAP(bars: Bar[]): number[] {
  if (bars.length === 0) return [];

  const result: number[] = [];
  let cumPV = 0;
  let cumVol = 0;

  for (const b of bars) {
    const tp = (b.h + b.l + b.c) / 3;
    cumPV += tp * b.vol;
    cumVol += b.vol;
    result.push(cumVol > 0 ? cumPV / cumVol : tp);
  }

  return result;
}
