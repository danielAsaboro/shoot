import type { Bar, StochResult } from "../core/types.js";

/**
 * Compute Stochastic oscillator.
 * %K = (close - lowestLow) / (highestHigh - lowestLow) * 100.
 * %D = simple moving average of %K over dPeriod.
 * Zero range (high == low) produces %K = 50.
 */
export function computeStochastic(
  bars: Bar[],
  kPeriod: number,
  dPeriod: number
): StochResult {
  if (kPeriod <= 0 || dPeriod <= 0 || bars.length < kPeriod) {
    return { k: [], d: [] };
  }

  const kValues: number[] = [];

  for (let i = kPeriod - 1; i < bars.length; i++) {
    let hh = -Infinity;
    let ll = Infinity;
    for (let j = i - kPeriod + 1; j <= i; j++) {
      if (bars[j].h > hh) hh = bars[j].h;
      if (bars[j].l < ll) ll = bars[j].l;
    }
    const range = hh - ll;
    kValues.push(range === 0 ? 50 : ((bars[i].c - ll) / range) * 100);
  }

  // %D = SMA of %K over dPeriod
  const dValues: number[] = [];
  if (kValues.length >= dPeriod) {
    let sum = 0;
    for (let i = 0; i < dPeriod; i++) sum += kValues[i];
    dValues.push(sum / dPeriod);
    for (let i = dPeriod; i < kValues.length; i++) {
      sum += kValues[i] - kValues[i - dPeriod];
      dValues.push(sum / dPeriod);
    }
  }

  return { k: kValues, d: dValues };
}
