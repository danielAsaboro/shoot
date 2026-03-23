import type { Bar } from "../core/types.js";

/**
 * Compute Average True Range using Wilder smoothing.
 * TR = max(h - l, |h - prevClose|, |l - prevClose|).
 * First ATR value = simple average of first `period` TRs.
 * Subsequent: ATR = (prevATR * (period - 1) + TR) / period.
 * Returns array of length max(0, bars.length - 1) after computing TR,
 * but only outputs ATR values starting from index (period - 1).
 * For insufficient data or period <= 0, returns [].
 */
export function computeATR(bars: Bar[], period: number): number[] {
  if (period <= 0 || bars.length < period + 1) return [];

  // Compute true ranges (needs previous close, so starts from index 1)
  const trs: number[] = [];
  for (let i = 1; i < bars.length; i++) {
    const h = bars[i].h;
    const l = bars[i].l;
    const pc = bars[i - 1].c;
    trs.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
  }

  if (trs.length < period) return [];

  // Seed: simple average of first `period` TRs
  let atr = 0;
  for (let i = 0; i < period; i++) atr += trs[i];
  atr /= period;

  const result: number[] = [atr];

  // Wilder smoothing
  for (let i = period; i < trs.length; i++) {
    atr = (atr * (period - 1) + trs[i]) / period;
    result.push(atr);
  }

  return result;
}
