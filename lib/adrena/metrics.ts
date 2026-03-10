import { computeDrawdownFromHWM } from "../competition/engine.ts";
import type { TraderPerformance } from "../competition/types.ts";
import type { AdrenaPosition } from "./client.ts";

/**
 * Minimum hold duration (seconds) for a position to count toward metrics.
 * Positions closed faster than this are treated as wash trades and excluded
 * from scoring to prevent volume inflation via rapid open/close cycling.
 *
 * Set to 60 seconds per the design doc: "Opens/closes of the same position
 * within 60 seconds count as 1 trade."
 */
export const MIN_HOLD_SECONDS = 60;

// ── Trade Event type (from DB / WebSocket) ──────────────────────────────────

export interface TradeEventRow {
  wallet: string;
  sizeUsd: number;
  collateralUsd: number;
  profitUsd: number;
  lossUsd: number;
  netPnl: number;
  closedAt: Date;
  /** Opening timestamp. Used for wash-trade duration filtering. */
  openedAt?: Date;
}

export function computeMetricsFromPositions(
  positions: AdrenaPosition[],
  windowStart: Date,
  windowEnd: Date
): TraderPerformance {
  const windowStartMs = windowStart.getTime();
  const windowEndMs = windowEnd.getTime();

  const closed = positions.filter((pos) => {
    if (
      (pos.status !== "close" && pos.status !== "liquidate") ||
      !pos.exit_date ||
      pos.pnl === null
    )
      return false;
    const exitMs = new Date(pos.exit_date).getTime();
    if (exitMs < windowStartMs || exitMs > windowEndMs) return false;
    // Wash trade filter: exclude positions held less than MIN_HOLD_SECONDS
    if (pos.entry_date) {
      const entryMs = new Date(pos.entry_date).getTime();
      const holdSeconds = (exitMs - entryMs) / 1000;
      if (holdSeconds < MIN_HOLD_SECONDS) return false;
    }
    return true;
  }) as (AdrenaPosition & { pnl: number; exit_date: string })[];

  if (closed.length === 0) {
    return {
      pnlPercent: 0,
      volumeUsd: 0,
      winRate: 0,
      consistencyScore: 0,
      maxDrawdownPercent: 0,
      attainedAt: new Date().toISOString(),
      tradeCount: 0,
      activeDays: 0,
    };
  }

  const totalPnl = closed.reduce((sum, pos) => sum + pos.pnl, 0);
  const totalCollateral = closed.reduce(
    (sum, pos) => sum + pos.collateral_amount,
    0
  );
  const pnlPercent =
    totalCollateral > 0 ? (totalPnl / totalCollateral) * 100 : 0;
  const volumeUsd = closed.reduce(
    (sum, pos) => sum + pos.entry_size * pos.entry_price,
    0
  );
  const winCount = closed.filter((pos) => pos.pnl > 0).length;
  const winRate = (winCount / closed.length) * 100;
  const consistencyScore = computeConsistencyScore(
    closed.map((pos) => pos.pnl),
    totalPnl / closed.length
  );

  const sortedByExit = [...closed].sort(
    (a, b) =>
      new Date(a.exit_date!).getTime() - new Date(b.exit_date!).getTime()
  );

  // Build cumulative PnL equity curve starting from 0
  const equityHistory = sortedByExit.reduce<number[]>(
    (acc, pos) => {
      acc.push(acc[acc.length - 1] + pos.pnl);
      return acc;
    },
    [0]
  );

  const maxDrawdownPercent = computeDrawdownFromHWM(equityHistory);
  const lastExit = sortedByExit[sortedByExit.length - 1].exit_date!;

  // Compute active trading days (distinct UTC dates)
  const activeDaySet = new Set(
    closed.map((pos) => pos.exit_date!.slice(0, 10))
  );

  return {
    pnlPercent: Number(pnlPercent.toFixed(2)),
    volumeUsd: Number(volumeUsd.toFixed(2)),
    winRate: Number(winRate.toFixed(2)),
    consistencyScore: Number(consistencyScore.toFixed(2)),
    maxDrawdownPercent: Number(maxDrawdownPercent.toFixed(2)),
    attainedAt: lastExit,
    tradeCount: closed.length,
    activeDays: activeDaySet.size,
  };
}

// ── Metrics from Trade Events (WebSocket-sourced) ───────────────────────────

export function computeMetricsFromTradeEvents(
  events: TradeEventRow[],
  windowStart: Date,
  windowEnd: Date
): TraderPerformance {
  const windowStartMs = windowStart.getTime();
  const windowEndMs = windowEnd.getTime();

  const inWindow = events.filter((e) => {
    const ms = e.closedAt.getTime();
    if (ms < windowStartMs || ms > windowEndMs) return false;
    // Wash trade filter: exclude positions held less than MIN_HOLD_SECONDS
    if (e.openedAt) {
      const holdSeconds = (ms - e.openedAt.getTime()) / 1000;
      if (holdSeconds < MIN_HOLD_SECONDS) return false;
    }
    return true;
  });

  if (inWindow.length === 0) {
    return {
      pnlPercent: 0,
      volumeUsd: 0,
      winRate: 0,
      consistencyScore: 0,
      maxDrawdownPercent: 0,
      attainedAt: new Date().toISOString(),
      tradeCount: 0,
      activeDays: 0,
    };
  }

  const totalPnl = inWindow.reduce((sum, e) => sum + e.netPnl, 0);
  const totalCollateral = inWindow.reduce((sum, e) => sum + e.collateralUsd, 0);
  const pnlPercent =
    totalCollateral > 0 ? (totalPnl / totalCollateral) * 100 : 0;
  const volumeUsd = inWindow.reduce((sum, e) => sum + e.sizeUsd, 0);
  const winCount = inWindow.filter((e) => e.profitUsd > 0).length;
  const winRate = (winCount / inWindow.length) * 100;

  const pnls = inWindow.map((e) => e.netPnl);
  const mean = totalPnl / inWindow.length;
  const consistencyScore = computeConsistencyScore(pnls, mean);

  const sorted = [...inWindow].sort(
    (a, b) => a.closedAt.getTime() - b.closedAt.getTime()
  );

  const equityHistory = sorted.reduce<number[]>(
    (acc, e) => {
      acc.push(acc[acc.length - 1] + e.netPnl);
      return acc;
    },
    [0]
  );

  const maxDrawdownPercent = computeDrawdownFromHWM(equityHistory);
  const lastClose = sorted[sorted.length - 1].closedAt;

  const activeDaySet = new Set(
    inWindow.map((e) => e.closedAt.toISOString().slice(0, 10))
  );

  return {
    pnlPercent: Number(pnlPercent.toFixed(2)),
    volumeUsd: Number(volumeUsd.toFixed(2)),
    winRate: Number(winRate.toFixed(2)),
    consistencyScore: Number(consistencyScore.toFixed(2)),
    maxDrawdownPercent: Number(maxDrawdownPercent.toFixed(2)),
    attainedAt: lastClose.toISOString(),
    tradeCount: inWindow.length,
    activeDays: activeDaySet.size,
  };
}

// ── Shared Helpers ──────────────────────────────────────────────────────────

function computeConsistencyScore(pnls: number[], mean: number): number {
  if (pnls.length <= 1) return 50;
  const variance =
    pnls.reduce((sum, pnl) => sum + Math.pow(pnl - mean, 2), 0) / pnls.length;
  const stdDev = Math.sqrt(variance);
  if (stdDev === 0) return mean >= 0 ? 100 : 0;
  const cv = stdDev / Math.abs(mean === 0 ? 0.0001 : mean);
  return Math.max(0, Math.min(100, 100 * (1 - Math.min(cv, 1))));
}
