import type { MacdResult } from "../core/types.js";

/** Private EMA computation — not exported */
function ema(values: number[], period: number): number[] {
  if (values.length === 0 || period <= 0) return [];
  const k = 2 / (period + 1);
  const result: number[] = [values[0]];
  for (let i = 1; i < values.length; i++) {
    result.push(values[i] * k + result[i - 1] * (1 - k));
  }
  return result;
}

/**
 * Compute MACD.
 * Line = EMA(fastLen) - EMA(slowLen).
 * Signal = EMA(signalLen) of the MACD line.
 * Histogram = Line - Signal.
 */
export function computeMACD(
  closes: number[],
  fastLen: number,
  slowLen: number,
  signalLen: number
): MacdResult {
  if (
    closes.length < slowLen ||
    fastLen <= 0 ||
    slowLen <= 0 ||
    signalLen <= 0
  ) {
    return { line: [], signal: [], histogram: [] };
  }

  const fastEma = ema(closes, fastLen);
  const slowEma = ema(closes, slowLen);

  const line: number[] = [];
  for (let i = 0; i < closes.length; i++) {
    line.push(fastEma[i] - slowEma[i]);
  }

  const sig = ema(line, signalLen);
  const histogram: number[] = [];
  for (let i = 0; i < line.length; i++) {
    histogram.push(line[i] - sig[i]);
  }

  return { line, signal: sig, histogram };
}
