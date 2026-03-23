/**
 * Edge-case tests for challenge evaluation, RAROI, scoring, and fee mechanics.
 * Covers boundary conditions not exercised by the base challenge-tiers.test.mts.
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluateChallenge,
  computeRAROI,
  computeDrawdownFromHWM,
  evaluateDailyLoss,
  calculateRetryFee,
  calculateFeeAllocation,
  computeScoreBreakdown,
} from "../lib/competition/engine.ts";
import { challengeTiers } from "../lib/competition/config.ts";
import { normalizeWeights } from "../lib/world-cup/engine.ts";
import type { TraderCompetitionProfile } from "../lib/competition/types.ts";

// ── Challenge evaluation: boundary conditions ──────────────────────────────────

test("scout tier passes when drawdown is exactly at limit (boundary: not exceeded)", () => {
  const result = evaluateChallenge(challengeTiers.scout, {
    pnlPercent: 9,
    maxDrawdownPercent: 5, // exactly at scout limit of 5%
    dailyLossPercent: 2,
    activeDays: 6,
    totalDays: 7,
    winRate: 52,
  });
  // drawdown === limit: should pass (limit is exclusive: must be strictly greater to fail)
  assert.equal(
    result.passed,
    true,
    `Expected pass at exact drawdown limit, got: ${result.reason}`
  );
});

test("scout tier fails when drawdown is 0.01% above limit", () => {
  const result = evaluateChallenge(challengeTiers.scout, {
    pnlPercent: 9,
    maxDrawdownPercent: 5.01,
    dailyLossPercent: 2,
    activeDays: 6,
    totalDays: 7,
    winRate: 52,
  });
  assert.equal(result.passed, false);
  assert.match(result.reason, /drawdown/i);
});

test("daily loss limit exactly at threshold passes", () => {
  const result = evaluateChallenge(challengeTiers.scout, {
    pnlPercent: 9,
    maxDrawdownPercent: 3,
    dailyLossPercent: 3, // exactly at scout daily limit of 3%
    activeDays: 6,
    totalDays: 7,
    winRate: 55,
  });
  assert.equal(
    result.passed,
    true,
    `Expected pass at exact daily loss limit, got: ${result.reason}`
  );
});

test("challenge fails when only profit target is unmet, all else valid", () => {
  const result = evaluateChallenge(challengeTiers.ranger, {
    pnlPercent: 9.99, // ranger target is 10%
    maxDrawdownPercent: 5,
    dailyLossPercent: 3,
    activeDays: 9,
    totalDays: 10,
    winRate: 60,
  });
  assert.equal(result.passed, false);
  assert.match(result.reason, /profit/i);
});

test("challenge with zero trades and zero P&L fails (not a pass on 0% target)", () => {
  const result = evaluateChallenge(challengeTiers.scout, {
    pnlPercent: 0,
    maxDrawdownPercent: 0,
    dailyLossPercent: 0,
    activeDays: 0,
    totalDays: 7,
    winRate: 0,
  });
  assert.equal(result.passed, false);
});

// ── Specialist challenge: market restriction ────────────────────────────────────

test("specialist challenge fails when a disallowed market trade is present", () => {
  const forexTier = {
    ...challengeTiers.scout,
    allowedMarkets: ["EUR/USD", "GBP/USD", "USD/JPY"],
  };

  const result = evaluateChallenge(
    forexTier,
    {
      pnlPercent: 10,
      maxDrawdownPercent: 3,
      dailyLossPercent: 2,
      activeDays: 5,
      totalDays: 7,
      winRate: 55,
    },
    [
      { market: "EUR/USD" },
      { market: "BTC" }, // disallowed
    ]
  );
  assert.equal(result.passed, false);
  assert.match(result.reason, /specialist/i);
});

test("specialist challenge passes when all trades are on allowed markets", () => {
  const forexTier = {
    ...challengeTiers.scout,
    allowedMarkets: ["EUR/USD", "GBP/USD", "USD/JPY"],
  };

  const result = evaluateChallenge(
    forexTier,
    {
      pnlPercent: 10,
      maxDrawdownPercent: 3,
      dailyLossPercent: 2,
      activeDays: 5,
      totalDays: 7,
      winRate: 55,
      tradeCount: 5,
    },
    [
      { market: "EUR/USD" },
      { market: "GBP/USD" },
      { market: "USD/JPY" },
      { market: "EUR/USD" },
      { market: "GBP/USD" },
    ]
  );
  assert.equal(
    result.passed,
    true,
    `Expected pass for all-allowed markets, got: ${result.reason}`
  );
});

// ── Drawdown from high-water mark ──────────────────────────────────────────────

test("drawdown from HWM is zero when equity only rises", () => {
  const dd = computeDrawdownFromHWM([100, 102, 105, 108, 112]);
  assert.equal(
    dd,
    0,
    `Expected 0 drawdown for monotonically rising equity, got ${dd}`
  );
});

test("drawdown from HWM is correct after partial recovery", () => {
  // Peak at 110, trough at 99 → drawdown = (110-99)/110 = ~10%
  const dd = computeDrawdownFromHWM([100, 105, 110, 99, 103]);
  const expected = ((110 - 99) / 110) * 100;
  assert.ok(
    Math.abs(dd - expected) < 0.01,
    `Expected ~${expected.toFixed(2)}%, got ${dd}`
  );
});

test("drawdown from single-element history is zero", () => {
  const dd = computeDrawdownFromHWM([100]);
  assert.equal(dd, 0);
});

test("drawdown from empty history is zero", () => {
  const dd = computeDrawdownFromHWM([]);
  assert.equal(dd, 0);
});

// ── Daily loss evaluation ──────────────────────────────────────────────────────
// evaluateDailyLoss(startEquity, dailyPnlByDay[], limitPercent)
// dailyPnlByDay: array of P&L per day (negative = loss)

test("daily loss is zero when all days are breakeven", () => {
  const result = evaluateDailyLoss(1000, [0, 0, 0], 3);
  assert.equal(result.worstDayPercent, 0);
  assert.equal(result.breached, false);
});

test("daily loss calculates correctly when equity drops 3%", () => {
  // Start 1000, one day loses $30 → 3% loss
  const result = evaluateDailyLoss(1000, [-30, 10, -5], 5);
  assert.ok(
    Math.abs(result.worstDayPercent - 3) < 0.01,
    `Expected 3%, got ${result.worstDayPercent}`
  );
});

test("daily loss breach detected when worst day exceeds limit", () => {
  // Start 1000, worst day loses $35 = 3.5%, limit is 3%
  const result = evaluateDailyLoss(1000, [-10, -35, -5], 3);
  assert.equal(result.breached, true);
});

test("daily loss not breached when worst day is exactly at limit", () => {
  // Worst day = exactly 3% of 1000 = $30 loss, limit is 3%
  const result = evaluateDailyLoss(1000, [-30], 3);
  assert.equal(result.breached, false, "Exactly at limit should not breach");
});

test("daily loss returns empty result for empty day array", () => {
  const result = evaluateDailyLoss(1000, [], 3);
  assert.equal(result.breached, false);
  assert.equal(result.worstDayPercent, 0);
});

// ── Retry fee mechanics ─────────────────────────────────────────────────────────

test("retry fee equals full fee after 48h window", () => {
  const fee = calculateRetryFee(challengeTiers.scout, 49); // 49 hours since failure
  assert.equal(
    fee,
    challengeTiers.scout.entryFee,
    `Expected full fee after 48h, got ${fee}`
  );
});

test("retry fee applies discount exactly at 48h boundary (within window)", () => {
  const discounted = calculateRetryFee(challengeTiers.scout, 48); // exactly 48h
  const expected =
    challengeTiers.scout.entryFee *
    (1 - challengeTiers.scout.retryDiscount / 100);
  assert.ok(
    Math.abs(discounted - expected) < 0.01,
    `Expected ${expected}, got ${discounted}`
  );
});

test("retry fee: elite discounted fee is less than full fee", () => {
  const full = calculateRetryFee(challengeTiers.elite, 72);
  const discounted = calculateRetryFee(challengeTiers.elite, 12);
  assert.ok(
    discounted < full,
    `Discounted fee ${discounted} should be less than full fee ${full}`
  );
});

// ── Fee allocation ─────────────────────────────────────────────────────────────

// FeeAllocation fields: { rewards, buyback, raffle, total } — 60/25/15 split

test("fee allocation sums to total input", () => {
  const alloc = calculateFeeAllocation(1000);
  const sum = alloc.rewards + alloc.buyback + alloc.raffle;
  assert.ok(
    Math.abs(sum - 1000) < 0.01,
    `Allocation should sum to 1000, got ${sum}`
  );
});

test("fee allocation percentages: rewards=60%, buyback=25%, raffle=15%", () => {
  const alloc = calculateFeeAllocation(100);
  assert.ok(
    Math.abs(alloc.rewards - 60) < 0.01,
    `Rewards should be 60, got ${alloc.rewards}`
  );
  assert.ok(
    Math.abs(alloc.buyback - 25) < 0.01,
    `ADX buyback should be 25, got ${alloc.buyback}`
  );
  assert.ok(
    Math.abs(alloc.raffle - 15) < 0.01,
    `Raffle should be 15, got ${alloc.raffle}`
  );
});

test("fee allocation scales proportionally for larger amounts", () => {
  const alloc100 = calculateFeeAllocation(100);
  const alloc1000 = calculateFeeAllocation(1000);
  assert.ok(Math.abs(alloc1000.rewards - alloc100.rewards * 10) < 0.01);
  assert.ok(Math.abs(alloc1000.buyback - alloc100.buyback * 10) < 0.01);
});

// ── RAROI edge cases ────────────────────────────────────────────────────────────

test("RAROI is zero when totalDays is zero (guard)", () => {
  const raroi = computeRAROI({
    pnlPercent: 15,
    winRate: 60,
    activeDays: 0,
    totalDays: 0,
    maxDrawdownPercent: 3,
  });
  assert.equal(raroi, 0);
});

test("RAROI is negative for a losing trader with high drawdown", () => {
  const raroi = computeRAROI({
    pnlPercent: -5,
    winRate: 30,
    activeDays: 3,
    totalDays: 14,
    maxDrawdownPercent: 12,
  });
  assert.ok(
    raroi < 0,
    `Expected negative RAROI for losing trader, got ${raroi}`
  );
});

test("RAROI consistency factor caps at 2.0 (100% win rate)", () => {
  const raroi100 = computeRAROI({
    pnlPercent: 20,
    winRate: 100,
    activeDays: 14,
    totalDays: 14,
    maxDrawdownPercent: 1,
  });
  const raroi80 = computeRAROI({
    pnlPercent: 20,
    winRate: 80,
    activeDays: 14,
    totalDays: 14,
    maxDrawdownPercent: 1,
  });
  // 100% WR should be better than 80% WR, but not infinite
  assert.ok(raroi100 > raroi80);
  assert.ok(raroi100 < 100, "RAROI should be bounded by formula caps");
});

// ── World Cup weight normalization ─────────────────────────────────────────────

test("weight normalization handles all-equal weights", () => {
  const weights = {
    riskAdjustedPnl: 20,
    consistency: 20,
    missionProgress: 20,
    streakPower: 20,
    raffleBonus: 20,
  };
  const normalized = normalizeWeights(weights);
  const total = Object.values(normalized).reduce((a, b) => a + b, 0);
  assert.ok(
    Math.abs(total - 100) < 0.01,
    `Normalized weights should sum to 100, got ${total}`
  );
  // Each should be 20
  assert.ok(Math.abs(normalized.riskAdjustedPnl - 20) < 0.01);
});

test("weight normalization handles extreme imbalance", () => {
  const weights = {
    riskAdjustedPnl: 999,
    consistency: 1,
    missionProgress: 0,
    streakPower: 0,
    raffleBonus: 0,
  };
  const normalized = normalizeWeights(weights);
  const total = Object.values(normalized).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(total - 100) < 0.01);
  assert.ok(
    normalized.riskAdjustedPnl > 99,
    "Dominant weight should be near 100%"
  );
});

// ── Score breakdown ──────────────────────────────────────────────────────────────

test("score breakdown: higher P&L yields higher score", () => {
  const makeProfile = (
    pnlPercent: number
  ): Pick<TraderCompetitionProfile, "performance"> => ({
    performance: {
      pnlPercent,
      volumeUsd: 100_000,
      winRate: 55,
      consistencyScore: 80,
      maxDrawdownPercent: 5,
      attainedAt: new Date().toISOString(),
    },
  });

  const low = computeScoreBreakdown(makeProfile(5));
  const high = computeScoreBreakdown(makeProfile(25));
  assert.ok(high.totalScore > low.totalScore);
  assert.ok(high.pnlContribution > low.pnlContribution);
});

test("score breakdown: drawdown penalty reduces total score", () => {
  const makeProfile = (
    maxDrawdownPercent: number
  ): Pick<TraderCompetitionProfile, "performance"> => ({
    performance: {
      pnlPercent: 15,
      volumeUsd: 100_000,
      winRate: 55,
      consistencyScore: 80,
      maxDrawdownPercent,
      attainedAt: new Date().toISOString(),
    },
  });

  const lowDD = computeScoreBreakdown(makeProfile(2));
  const highDD = computeScoreBreakdown(makeProfile(12));
  assert.ok(
    lowDD.totalScore > highDD.totalScore,
    "Lower drawdown should yield higher score"
  );
  assert.ok(
    highDD.drawdownPenalty > lowDD.drawdownPenalty,
    "Higher drawdown should have larger penalty"
  );
});

// ── Minimum capital enforcement ──────────────────────────────────────────────

test("challenge fails when startingEquity is below tier minCapital", () => {
  const result = evaluateChallenge(challengeTiers.apex, {
    pnlPercent: 20,
    maxDrawdownPercent: 3,
    dailyLossPercent: 1,
    activeDays: 12,
    totalDays: 14,
    winRate: 65,
    startingEquity: 100, // Apex requires $5000
  });
  assert.equal(result.passed, false);
  assert.match(result.reason, /insufficient capital/i);
});

test("challenge passes when startingEquity meets tier minCapital", () => {
  const result = evaluateChallenge(challengeTiers.scout, {
    pnlPercent: 10,
    maxDrawdownPercent: 3,
    dailyLossPercent: 2,
    activeDays: 5,
    totalDays: 7,
    winRate: 55,
    startingEquity: 50, // Scout requires $50
  });
  assert.equal(
    result.passed,
    true,
    `Expected pass with exact minCapital, got: ${result.reason}`
  );
});

test("challenge skips minCapital check when startingEquity is undefined (backwards compat)", () => {
  const result = evaluateChallenge(challengeTiers.apex, {
    pnlPercent: 20,
    maxDrawdownPercent: 3,
    dailyLossPercent: 1,
    activeDays: 12,
    totalDays: 14,
    winRate: 65,
    // no startingEquity — legacy callers
  });
  assert.equal(
    result.passed,
    true,
    `Expected pass without startingEquity, got: ${result.reason}`
  );
});

// ── Sprint (48h micro-competition) tier ──────────────────────────────────────

test("sprint tier is defined with 2-day duration and $1 entry", () => {
  assert.equal(challengeTiers.sprint.durationDays, 2);
  assert.equal(challengeTiers.sprint.entryFee, 1);
  assert.equal(challengeTiers.sprint.minCapital, 25);
  assert.equal(challengeTiers.sprint.fundedEligible, false);
});

test("sprint tier passes with adequate performance", () => {
  const result = evaluateChallenge(challengeTiers.sprint, {
    pnlPercent: 6,
    maxDrawdownPercent: 3,
    dailyLossPercent: 2,
    activeDays: 2,
    totalDays: 2,
    winRate: 55,
    startingEquity: 30,
    tradeCount: 5,
  });
  assert.equal(
    result.passed,
    true,
    `Expected sprint pass, got: ${result.reason}`
  );
});

test("sprint tier fails below profit target", () => {
  const result = evaluateChallenge(challengeTiers.sprint, {
    pnlPercent: 4.9,
    maxDrawdownPercent: 3,
    dailyLossPercent: 2,
    activeDays: 2,
    totalDays: 2,
    winRate: 55,
    startingEquity: 30,
    tradeCount: 5,
  });
  assert.equal(result.passed, false);
  assert.match(result.reason, /profit/i);
});
