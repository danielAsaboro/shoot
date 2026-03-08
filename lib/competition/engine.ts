import {
  competitionConfig,
} from "./config.ts";
import type {
  AbusePolicyResult,
  ChallengeTier,
  ChallengeTierId,
  ScoreBreakdown,
  ScoringMode,
  TraderCompetitionProfile,
} from "./types.ts";

export function computeTournamentScore(
  profile: TraderCompetitionProfile,
  mode: ScoringMode = "standard",
  totalDays: number = 14
): number {
  if (mode === "raroi") {
    return computeRAROI({
      pnlPercent: profile.performance.pnlPercent,
      winRate: profile.performance.winRate,
      activeDays: profile.performance.activeDays ?? 0,
      totalDays,
      maxDrawdownPercent: profile.performance.maxDrawdownPercent,
    });
  }
  return computeScoreBreakdown(profile).totalScore;
}

export function computeScoreBreakdown(
  profile: Pick<TraderCompetitionProfile, "performance">
): ScoreBreakdown {
  const weights = competitionConfig.scoringWeights;
  const volumeContribution =
    Math.log10(profile.performance.volumeUsd + 1) * weights.volumeUsd;
  const pnlContribution = profile.performance.pnlPercent * weights.pnlPercent;
  const consistencyContribution =
    profile.performance.consistencyScore * weights.consistency;
  const winRateContribution = profile.performance.winRate * weights.winRate;
  const drawdownPenalty =
    profile.performance.maxDrawdownPercent * weights.drawdownPenalty;
  const rawScore =
    pnlContribution +
    volumeContribution +
    consistencyContribution +
    winRateContribution -
    drawdownPenalty;

  return {
    pnlContribution: Number(pnlContribution.toFixed(2)),
    volumeContribution: Number(volumeContribution.toFixed(2)),
    consistencyContribution: Number(consistencyContribution.toFixed(2)),
    winRateContribution: Number(winRateContribution.toFixed(2)),
    drawdownPenalty: Number(drawdownPenalty.toFixed(2)),
    totalScore: Number(rawScore.toFixed(2)),
  };
}

export function evaluateAbusePolicy(
  profile: TraderCompetitionProfile
): AbusePolicyResult {
  if (!profile.abuseFlags.length) {
    return {
      wallet: profile.wallet,
      displayName: profile.displayName,
      flags: [],
      eligible: true,
    };
  }

  const reasonMap: Record<string, string> = {
    manual_review: "Queued for ops review before rewards unlock.",
    sybil_suspicion: "Linked wallets detected in the same cohort.",
    wash_trading_suspicion: "Unnatural volume profile requires review.",
  };

  return {
    wallet: profile.wallet,
    displayName: profile.displayName,
    flags: profile.abuseFlags,
    eligible: false,
    reason: reasonMap[profile.abuseFlags[0]] ?? "Eligibility is under review.",
  };
}

export interface ChallengePerformance {
  pnlPercent: number;
  maxDrawdownPercent: number;
  dailyLossPercent: number;
  activeDays: number;
  totalDays: number;
  winRate: number;
  tradeCount?: number;
  /** Starting equity (USD) at enrollment. Used for minCapital enforcement. */
  startingEquity?: number;
  /** Current active collateral (USD). If below minCapital, challenge pauses. */
  currentEquity?: number;
}

export interface ChallengeEvaluation {
  passed: boolean;
  reason: string;
  tier: ChallengeTier;
  /** Consolation raffle ticket awarded on failure (1 ticket). 0 on pass. */
  consolationRaffleTicket: number;
  /** If true, the challenge is paused (capital below minimum) — not failed yet. */
  paused?: boolean;
  /** When the challenge was paused (ISO timestamp). Auto-fails after 24h. */
  pausedAt?: string;
}

function withConsolation(result: Omit<ChallengeEvaluation, "consolationRaffleTicket">): ChallengeEvaluation {
  return { ...result, consolationRaffleTicket: result.passed ? 0 : 1 };
}

export function evaluateChallenge(
  tier: ChallengeTier,
  performance: ChallengePerformance,
  trades?: Array<{ market: string }>,
  config?: { minTrades?: number; minActiveDays?: number }
): ChallengeEvaluation {
  // Specialist challenge: reject any trade on a disallowed market (immediate DQ)
  if (tier.allowedMarkets && tier.allowedMarkets.length > 0 && trades) {
    const disallowed = trades.filter(
      (trade) => !tier.allowedMarkets!.includes(trade.market)
    );
    if (disallowed.length > 0) {
      const markets = [...new Set(disallowed.map((t) => t.market))].join(", ");
      return withConsolation({
        passed: false,
        reason: `Specialist violation: trades on disallowed market(s) [${markets}]. Only [${tier.allowedMarkets.join(", ")}] are permitted.`,
        tier,
      });
    }
  }

  // Minimum capital check at enrollment — reject if starting capital too low
  if (
    performance.startingEquity !== undefined &&
    performance.startingEquity < tier.minCapital
  ) {
    return withConsolation({
      passed: false,
      reason: `Insufficient capital: $${performance.startingEquity.toFixed(0)} is below the ${tier.name} tier minimum of $${tier.minCapital}.`,
      tier,
    });
  }

  // Active capital check — pause (not fail) if current equity drops below minimum.
  // Trader has 24 hours to re-deposit before the challenge auto-fails.
  if (
    performance.currentEquity !== undefined &&
    performance.currentEquity < tier.minCapital
  ) {
    return {
      passed: false,
      paused: true,
      pausedAt: new Date().toISOString(),
      reason: `Challenge paused: active collateral $${performance.currentEquity.toFixed(0)} dropped below the ${tier.name} minimum of $${tier.minCapital}. Deposit within 24 hours or the challenge fails.`,
      tier,
      consolationRaffleTicket: 0,
    };
  }

  // Minimum trades check (default: 5)
  const minTrades = config?.minTrades ?? 5;
  const tradeCount = performance.tradeCount ?? (trades?.length ?? minTrades);
  if (tradeCount < minTrades) {
    return withConsolation({
      passed: false,
      reason: `Insufficient trades: ${tradeCount} executed, minimum ${minTrades} required.`,
      tier,
    });
  }

  // Minimum active days check
  const minActiveDays = config?.minActiveDays;
  if (minActiveDays !== undefined && performance.activeDays < minActiveDays) {
    return withConsolation({
      passed: false,
      reason: `Insufficient active days: ${performance.activeDays} active, minimum ${minActiveDays} required.`,
      tier,
    });
  }

  if (performance.maxDrawdownPercent > tier.maxDrawdown) {
    return withConsolation({
      passed: false,
      reason: `Max drawdown ${performance.maxDrawdownPercent.toFixed(1)}% exceeded limit of ${tier.maxDrawdown}%`,
      tier,
    });
  }

  if (performance.dailyLossPercent > tier.dailyLossLimit) {
    return withConsolation({
      passed: false,
      reason: `Daily loss ${performance.dailyLossPercent.toFixed(1)}% exceeded limit of ${tier.dailyLossLimit}%`,
      tier,
    });
  }

  if (performance.pnlPercent < tier.profitTarget) {
    return withConsolation({
      passed: false,
      reason: `Profit ${performance.pnlPercent.toFixed(1)}% below target of ${tier.profitTarget}%`,
      tier,
    });
  }

  return withConsolation({
    passed: true,
    reason: `Passed ${tier.name} challenge: ${performance.pnlPercent.toFixed(1)}% profit with ${performance.maxDrawdownPercent.toFixed(1)}% max drawdown`,
    tier,
  });
}

export function computeRAROI(metrics: {
  pnlPercent: number;
  winRate: number;
  activeDays: number;
  totalDays: number;
  maxDrawdownPercent: number;
}): number {
  // Guard: a challenge with no elapsed days cannot be evaluated
  if (metrics.totalDays === 0) return 0;

  const roi = metrics.pnlPercent;
  const winRateFactor = Math.min(2, 0.5 + (metrics.winRate / 100) * 1.5);
  const activityFactor = Math.min(
    1.5,
    0.5 + metrics.activeDays / metrics.totalDays
  );
  const drawdownPenalty = metrics.maxDrawdownPercent * 0.3;

  // RAROI = ROI% × WinRateFactor × ActivityFactor − DrawdownPenalty
  // This multiplicative formula is used for World Cup head-to-head ranking
  // (design doc §6.2). The cohort leaderboard uses computeScoreBreakdown,
  // which is an additive formula that also weights trading volume — a
  // deliberate choice to incentivise activity in the prop-challenge format.
  const raroi = roi * winRateFactor * activityFactor - drawdownPenalty;
  return Number(raroi.toFixed(2));
}

/**
 * Computes the maximum drawdown from the high-water mark across an equity
 * history sequence. This matches the design-doc definition: drawdown is
 * measured from the highest peak reached during the challenge, not from the
 * starting balance.
 *
 * @param equityHistory - Ordered sequence of equity values (e.g. end-of-day)
 * @returns Worst peak-to-trough drawdown as a percentage (0–100)
 */
export function computeDrawdownFromHWM(equityHistory: number[]): number {
  if (equityHistory.length === 0) return 0;

  let peak = equityHistory[0];
  let maxDrawdown = 0;

  for (const equity of equityHistory) {
    if (equity > peak) {
      peak = equity;
    }
    if (peak > 0) {
      const drawdown = ((peak - equity) / peak) * 100;
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
      }
    }
  }

  return Number(maxDrawdown.toFixed(2));
}

/**
 * Evaluates whether a daily loss limit was breached on any calendar day.
 * The design doc specifies: "If you lose 3% of your starting balance in a
 * single calendar day (UTC), your challenge is suspended until the next day."
 *
 * @param startEquity - The starting account balance for the challenge
 * @param dailyPnlByDay - P&L for each day (negative = loss)
 * @param limitPercent - Daily loss limit as a percentage of starting equity
 * @returns Whether the limit was breached and which day had the worst loss
 */
export function evaluateDailyLoss(
  startEquity: number,
  dailyPnlByDay: number[],
  limitPercent: number
): { breached: boolean; worstDayPercent: number; worstDayIndex: number } {
  if (startEquity <= 0 || dailyPnlByDay.length === 0) {
    return { breached: false, worstDayPercent: 0, worstDayIndex: -1 };
  }

  let worstDayPercent = 0;
  let worstDayIndex = -1;

  for (let i = 0; i < dailyPnlByDay.length; i++) {
    const dailyLossPercent = (-dailyPnlByDay[i] / startEquity) * 100;
    if (dailyLossPercent > worstDayPercent) {
      worstDayPercent = dailyLossPercent;
      worstDayIndex = i;
    }
  }

  return {
    breached: worstDayPercent > limitPercent,
    worstDayPercent: Number(worstDayPercent.toFixed(2)),
    worstDayIndex,
  };
}

export function calculateRetryFee(
  tier: ChallengeTier,
  hoursSinceFailure: number
): number {
  const retryWindowHours = 48;
  if (hoursSinceFailure <= retryWindowHours) {
    const discountedFee = tier.entryFee * (1 - tier.retryDiscount / 100);
    return Number(discountedFee.toFixed(2));
  }
  return tier.entryFee;
}

export interface FeeAllocation {
  rewards: number;
  buyback: number;
  raffle: number;
  total: number;
}

export function calculateFeeAllocation(totalFees: number): FeeAllocation {
  return {
    rewards: Number((totalFees * 0.60).toFixed(2)),
    buyback: Number((totalFees * 0.25).toFixed(2)),
    raffle: Number((totalFees * 0.15).toFixed(2)),
    total: totalFees,
  };
}

// ── Pass-Rate Guardrails ────────────────────────────────────────────────────

export interface PassRateGuardrail {
  tierId: ChallengeTierId;
  passRate: number;
  sampleSize: number;
  adjustment: "tighten" | "relax" | "none";
  adjustedProfitTarget?: number;
  adjustedMaxDrawdown?: number;
}

/**
 * Evaluate pass-rate guardrails for a tier over a rolling window.
 *
 * Rules from PRD:
 * - >40% pass rate → tighten profit target by +1 percentage point
 * - <15% pass rate → relax max drawdown by +1 percentage point
 * - Otherwise → no adjustment
 *
 * @param tier - Current tier configuration
 * @param passCount - Number of passes in the rolling window
 * @param totalCount - Total challenges evaluated in the rolling window
 * @returns Guardrail result with any recommended adjustments
 */
export function evaluatePassRateGuardrail(
  tier: ChallengeTier,
  passCount: number,
  totalCount: number
): PassRateGuardrail {
  if (totalCount < 10) {
    // Not enough data — require at least 10 completed challenges
    return {
      tierId: tier.id as ChallengeTierId,
      passRate: totalCount > 0 ? passCount / totalCount : 0,
      sampleSize: totalCount,
      adjustment: "none",
    };
  }

  const passRate = passCount / totalCount;

  if (passRate > 0.40) {
    return {
      tierId: tier.id as ChallengeTierId,
      passRate,
      sampleSize: totalCount,
      adjustment: "tighten",
      adjustedProfitTarget: tier.profitTarget + 1, // +1 percentage point
    };
  }

  if (passRate < 0.15) {
    return {
      tierId: tier.id as ChallengeTierId,
      passRate,
      sampleSize: totalCount,
      adjustment: "relax",
      adjustedMaxDrawdown: tier.maxDrawdown + 1, // +1 percentage point
    };
  }

  return {
    tierId: tier.id as ChallengeTierId,
    passRate,
    sampleSize: totalCount,
    adjustment: "none",
  };
}

