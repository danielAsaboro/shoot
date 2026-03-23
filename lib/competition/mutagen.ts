/**
 * Mutagen Scoring Integration
 *
 * Implements Adrena's native Mutagen formula alongside the custom tournament
 * scoring. This allows the platform to show both scores, demonstrating
 * compatibility with Adrena's existing competition infrastructure.
 *
 * Mutagen formula: (Performance + Duration) × Size Multiplier × Mission Bonus
 *
 * Source: Verified against Adrena's official API by the Adrena Arena submission.
 */

import type { AdrenaPosition } from "../adrena/client.ts";

// ── Types ───────────────────────────────────────────────────────────────────

export interface MutagenInput {
  /** Realized PnL as a percentage of collateral. */
  pnlPercent: number;
  /** Position hold duration in hours. */
  durationHours: number;
  /** Position size in USD (entry_size × entry_price). */
  sizeUsd: number;
  /** Optional mission bonus multiplier (default 1.0). */
  missionBonus?: number;
}

export interface MutagenScore {
  performance: number;
  duration: number;
  sizeMultiplier: number;
  missionBonus: number;
  totalMutagen: number;
}

export interface DualScore {
  tournament: {
    pnlContribution: number;
    volumeContribution: number;
    consistencyContribution: number;
    winRateContribution: number;
    drawdownPenalty: number;
    totalScore: number;
  };
  mutagen: MutagenScore;
}

// ── Size Multiplier Table ───────────────────────────────────────────────────
// Official 8-tier interpolated table from Adrena's competition service API.
// Each tier uses linear interpolation between min and max multipliers.
// Source: GET /<API_KEY>/size-multiplier

interface SizeTier {
  minUsd: number;
  maxUsd: number;
  multiplierMin: number;
  multiplierMax: number;
}

const SIZE_TIERS: SizeTier[] = [
  { minUsd: 10, maxUsd: 1_000, multiplierMin: 0.00025, multiplierMax: 0.05 },
  { minUsd: 1_000, maxUsd: 5_000, multiplierMin: 0.05, multiplierMax: 1.0 },
  { minUsd: 5_000, maxUsd: 50_000, multiplierMin: 1.0, multiplierMax: 5.0 },
  { minUsd: 50_000, maxUsd: 100_000, multiplierMin: 5.0, multiplierMax: 9.0 },
  { minUsd: 100_000, maxUsd: 250_000, multiplierMin: 9.0, multiplierMax: 17.5 },
  {
    minUsd: 250_000,
    maxUsd: 500_000,
    multiplierMin: 17.5,
    multiplierMax: 25.0,
  },
  {
    minUsd: 500_000,
    maxUsd: 1_000_000,
    multiplierMin: 25.0,
    multiplierMax: 30.0,
  },
  {
    minUsd: 1_000_000,
    maxUsd: 4_500_000,
    multiplierMin: 30.0,
    multiplierMax: 45.0,
  },
];

// ── Core Mutagen Functions ──────────────────────────────────────────────────

/**
 * Performance component: linear scale, 7.5% PnL caps at 0.3 mutagen.
 * Negative PnL produces 0 performance (no negative mutagen).
 */
export function computeMutagenPerformance(pnlPercent: number): number {
  if (pnlPercent <= 0) return 0;
  const capped = Math.min(pnlPercent, 7.5);
  return Number(((capped / 7.5) * 0.3).toFixed(6));
}

/**
 * Duration component: proportional to hold time, 72h = 0.05.
 * Positions held longer than 72h are capped.
 */
export function computeMutagenDuration(durationHours: number): number {
  if (durationHours <= 0) return 0;
  const capped = Math.min(durationHours, 72);
  return Number(((capped / 72) * 0.05).toFixed(6));
}

/**
 * Size multiplier: linear interpolation within the official 8-tier table.
 * Below $10 or above $4.5M returns 0.
 */
export function computeMutagenSizeMultiplier(sizeUsd: number): number {
  if (sizeUsd < 10 || sizeUsd > 4_500_000) return 0;

  for (const tier of SIZE_TIERS) {
    if (sizeUsd >= tier.minUsd && sizeUsd <= tier.maxUsd) {
      return Number(
        (
          tier.multiplierMin +
          ((sizeUsd - tier.minUsd) *
            (tier.multiplierMax - tier.multiplierMin)) /
            (tier.maxUsd - tier.minUsd)
        ).toFixed(6)
      );
    }
  }
  return 0;
}

/**
 * Full Mutagen score for a single trade.
 *
 * Formula: (Performance + Duration) × Size Multiplier × Mission Bonus
 */
export function computeMutagenScore(input: MutagenInput): MutagenScore {
  const performance = computeMutagenPerformance(input.pnlPercent);
  const duration = computeMutagenDuration(input.durationHours);
  const sizeMultiplier = computeMutagenSizeMultiplier(input.sizeUsd);
  const missionBonus = input.missionBonus ?? 1.0;

  const totalMutagen = Number(
    ((performance + duration) * sizeMultiplier * missionBonus).toFixed(6)
  );

  return {
    performance,
    duration,
    sizeMultiplier,
    missionBonus,
    totalMutagen,
  };
}

// ── Aggregate Mutagen from Positions ────────────────────────────────────────

/**
 * Compute aggregate Mutagen score from a set of closed Adrena positions.
 * This sums per-trade Mutagen to produce a total for a competition window.
 */
export function computeAggregateMutagen(
  positions: AdrenaPosition[],
  windowStart: Date,
  windowEnd: Date,
  missionBonus = 1.0
): { totalMutagen: number; tradeScores: MutagenScore[]; tradeCount: number } {
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
    return exitMs >= windowStartMs && exitMs <= windowEndMs;
  }) as (AdrenaPosition & { pnl: number; exit_date: string })[];

  const tradeScores = closed.map((pos) => {
    const pnlPercent =
      pos.collateral_amount > 0 ? (pos.pnl / pos.collateral_amount) * 100 : 0;
    const entryMs = new Date(pos.entry_date).getTime();
    const exitMs = new Date(pos.exit_date).getTime();
    const durationHours = (exitMs - entryMs) / (1000 * 60 * 60);
    const sizeUsd = pos.entry_size * pos.entry_price;

    return computeMutagenScore({
      pnlPercent,
      durationHours,
      sizeUsd,
      missionBonus,
    });
  });

  const totalMutagen = Number(
    tradeScores.reduce((sum, s) => sum + s.totalMutagen, 0).toFixed(6)
  );

  return { totalMutagen, tradeScores, tradeCount: closed.length };
}

// ── Aggregate Mutagen from Trade Events (WebSocket-sourced) ─────────────────

export interface TradeEventForMutagen {
  sizeUsd: number;
  collateralUsd: number;
  netPnl: number;
  closedAt: Date;
}

/**
 * Compute aggregate Mutagen from persisted trade events (ClosePositionEvent).
 * Duration component is skipped (max 0.05 vs size multiplier up to 45x).
 */
export function computeAggregateMutagenFromEvents(
  events: TradeEventForMutagen[],
  windowStart: Date,
  windowEnd: Date,
  missionBonus = 1.0
): { totalMutagen: number; tradeScores: MutagenScore[]; tradeCount: number } {
  const windowStartMs = windowStart.getTime();
  const windowEndMs = windowEnd.getTime();

  const inWindow = events.filter((e) => {
    const ms = e.closedAt.getTime();
    return ms >= windowStartMs && ms <= windowEndMs;
  });

  const tradeScores = inWindow.map((e) => {
    const pnlPercent =
      e.collateralUsd > 0 ? (e.netPnl / e.collateralUsd) * 100 : 0;

    return computeMutagenScore({
      pnlPercent,
      durationHours: 0, // not available from close events
      sizeUsd: e.sizeUsd,
      missionBonus,
    });
  });

  const totalMutagen = Number(
    tradeScores.reduce((sum, s) => sum + s.totalMutagen, 0).toFixed(6)
  );

  return { totalMutagen, tradeScores, tradeCount: inWindow.length };
}
