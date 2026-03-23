import type { Bar, KeltnerEnvelope } from "../core/types.js";
import { computeATR } from "./atr.js";

/** Private EMA for Keltner basis */
function emaSeries(values: number[], period: number): number[] {
  if (values.length === 0 || period <= 0) return [];
  const k = 2 / (period + 1);
  const result: number[] = [values[0]];
  for (let i = 1; i < values.length; i++) {
    result.push(values[i] * k + result[i - 1] * (1 - k));
  }
  return result;
}

/**
 * Compute Keltner Channels.
 * Basis = EMA(close, period).
 * Upper = Basis + atrMultiplier * ATR(period).
 * Lower = Basis - atrMultiplier * ATR(period).
 * Returns only the overlapping portion where both EMA and ATR are available.
 */
export function computeKeltner(
  bars: Bar[],
  period: number,
  atrMultiplier: number
): KeltnerEnvelope {
  if (period <= 0 || bars.length < period + 1) {
    return { upper: [], basis: [], lower: [] };
  }

  const closes = bars.map((b) => b.c);
  const basisFull = emaSeries(closes, period);
  const atrValues = computeATR(bars, period);

  // ATR array starts at index `period` of the bars (offset by 1 for TR + period-1 for seed).
  // ATR length = bars.length - period.
  // Basis length = bars.length.
  // Align from the end.
  const atrLen = atrValues.length;
  const basisOffset = basisFull.length - atrLen;

  const upper: number[] = [];
  const basis: number[] = [];
  const lower: number[] = [];

  for (let i = 0; i < atrLen; i++) {
    const b = basisFull[basisOffset + i];
    const a = atrValues[i] * atrMultiplier;
    basis.push(b);
    upper.push(b + a);
    lower.push(b - a);
  }

  return { upper, basis, lower };
}
