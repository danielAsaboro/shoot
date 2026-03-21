import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluateChallenge,
  computeRAROI,
  computeDrawdownFromHWM,
  evaluateDailyLoss,
  calculateRetryFee,
  calculateFeeAllocation,
} from "../lib/competition/engine.ts";
import {
  challengeTiers,
  specialistChallenges,
} from "../lib/competition/config.ts";

test("scout tier passes with adequate performance", () => {
  const result = evaluateChallenge(challengeTiers.scout, {
    pnlPercent: 10,
    maxDrawdownPercent: 3,
    dailyLossPercent: 2,
    activeDays: 5,
    totalDays: 7,
    winRate: 55,
  });
  assert.equal(result.passed, true);
});

test("scout tier fails when drawdown exceeds limit", () => {
  const result = evaluateChallenge(challengeTiers.scout, {
    pnlPercent: 10,
    maxDrawdownPercent: 6,
    dailyLossPercent: 2,
    activeDays: 5,
    totalDays: 7,
    winRate: 55,
  });
  assert.equal(result.passed, false);
  assert.match(result.reason, /drawdown/i);
});

test("apex tier fails when profit below target", () => {
  const result = evaluateChallenge(challengeTiers.apex, {
    pnlPercent: 12,
    maxDrawdownPercent: 3,
    dailyLossPercent: 1,
    activeDays: 12,
    totalDays: 14,
    winRate: 60,
  });
  assert.equal(result.passed, false);
  assert.match(result.reason, /profit/i);
});

test("elite tier passes with strong performance", () => {
  const result = evaluateChallenge(challengeTiers.elite, {
    pnlPercent: 18,
    maxDrawdownPercent: 4,
    dailyLossPercent: 2,
    activeDays: 12,
    totalDays: 14,
    winRate: 62,
  });
  assert.equal(result.passed, true);
});

test("veteran tier fails on daily loss limit", () => {
  const result = evaluateChallenge(challengeTiers.veteran, {
    pnlPercent: 14,
    maxDrawdownPercent: 4,
    dailyLossPercent: 4,
    activeDays: 8,
    totalDays: 10,
    winRate: 58,
  });
  assert.equal(result.passed, false);
  assert.match(result.reason, /daily loss/i);
});

test("RAROI rewards skill over capital", () => {
  const highSkill = computeRAROI({
    pnlPercent: 12,
    winRate: 65,
    activeDays: 13,
    totalDays: 14,
    maxDrawdownPercent: 3,
  });

  const lowSkill = computeRAROI({
    pnlPercent: 12,
    winRate: 40,
    activeDays: 5,
    totalDays: 14,
    maxDrawdownPercent: 8,
  });

  assert.ok(highSkill > lowSkill);
});

test("RAROI produces positive value for good performance", () => {
  const raroi = computeRAROI({
    pnlPercent: 15,
    winRate: 60,
    activeDays: 10,
    totalDays: 14,
    maxDrawdownPercent: 4,
  });
  assert.ok(raroi > 0);
});

test("retry fee applies 30% discount within 48h window", () => {
  const fullFee = calculateRetryFee(challengeTiers.elite, 72);
  const discountedFee = calculateRetryFee(challengeTiers.elite, 24);

  assert.equal(fullFee, 25);
  assert.equal(discountedFee, 17.5);
});

test("fee allocation splits correctly (60/25/15)", () => {
  const allocation = calculateFeeAllocation(1000);
  assert.equal(allocation.rewards, 600);
  assert.equal(allocation.buyback, 250);
  assert.equal(allocation.raffle, 150);
  assert.equal(allocation.total, 1000);
});

test("all five tiers are defined with correct funded eligibility", () => {
  assert.equal(challengeTiers.scout.fundedEligible, false);
  assert.equal(challengeTiers.ranger.fundedEligible, false);
  assert.equal(challengeTiers.veteran.fundedEligible, false);
  assert.equal(challengeTiers.elite.fundedEligible, true);
  assert.equal(challengeTiers.apex.fundedEligible, true);
});

test("specialist challenges define valid market sets", () => {
  assert.ok(specialistChallenges.crypto.markets.length >= 3);
  assert.ok(specialistChallenges.metals.markets.length >= 2);
  assert.ok(specialistChallenges.energy.markets.length >= 2);
  assert.ok(specialistChallenges.forex.markets.length >= 3);
  assert.ok(specialistChallenges.multi_asset.markets.length >= 4);
});

// ── New tests covering previously missing coverage ────────────────────────────

test("RAROI returns 0 when totalDays is zero (div-by-zero guard)", () => {
  const result = computeRAROI({
    pnlPercent: 20,
    winRate: 70,
    activeDays: 0,
    totalDays: 0,
    maxDrawdownPercent: 5,
  });
  assert.equal(result, 0);
});

test("RAROI produces negative value for a losing trader", () => {
  const result = computeRAROI({
    pnlPercent: -5,
    winRate: 30,
    activeDays: 3,
    totalDays: 14,
    maxDrawdownPercent: 12,
  });
  assert.ok(result < 0);
});

// Design-doc §6.2 four-trader worked example.
// Actual formula outputs (RAROI = ROI × WinRateFactor × ActivityFactor − DrawdownPenalty):
//   Alice — ROI 20%, winRate 60%, active 13/14, dd 3%  → ~39.10
//     (wrf=1.4, af=1.43, pen=0.9)
//   Bob   — ROI  2%, winRate 55%, active 10/14, dd 2%  → ~2.62
//     (wrf=1.325, af=1.21, pen=0.6)
//   Carol — ROI 25%, winRate 50%, active  7/14, dd 5%  → ~29.75
//     (wrf=1.25, af=1.0, pen=1.5)  — penalised by low activity
//   Dave  — ROI 40%, winRate 70%, active 14/14, dd 5%  → ~91.5
//     (wrf=1.55, af=1.5, pen=1.5)
// Rank: Dave > Alice > Carol > Bob
test("RAROI matches design-doc §6.2 worked examples", () => {
  const alice = computeRAROI({ pnlPercent: 20, winRate: 60, activeDays: 13, totalDays: 14, maxDrawdownPercent: 3 });
  const bob   = computeRAROI({ pnlPercent: 2,  winRate: 55, activeDays: 10, totalDays: 14, maxDrawdownPercent: 2 });
  const carol = computeRAROI({ pnlPercent: 25, winRate: 50, activeDays:  7, totalDays: 14, maxDrawdownPercent: 5 });
  const dave  = computeRAROI({ pnlPercent: 40, winRate: 70, activeDays: 14, totalDays: 14, maxDrawdownPercent: 5 });

  // Rank order: Dave > Alice > Carol > Bob
  assert.ok(dave  > alice, `dave(${dave}) should beat alice(${alice})`);
  assert.ok(alice > carol, `alice(${alice}) should beat carol(${carol})`);
  assert.ok(carol > bob,   `carol(${carol}) should beat bob(${bob})`);

  // All values should be positive for these profitable traders
  assert.ok(alice > 0);
  assert.ok(bob > 0);
  assert.ok(carol > 0);
  assert.ok(dave > 0);
});

test("RAROI: same P&L, different capital discipline ranks correctly", () => {
  // Two traders with identical 15% P&L but different risk profiles
  const disciplined = computeRAROI({ pnlPercent: 15, winRate: 65, activeDays: 12, totalDays: 14, maxDrawdownPercent: 2 });
  const reckless    = computeRAROI({ pnlPercent: 15, winRate: 45, activeDays:  6, totalDays: 14, maxDrawdownPercent: 10 });
  assert.ok(disciplined > reckless, `disciplined(${disciplined}) should beat reckless(${reckless})`);
});

test("evaluateChallenge AT drawdown boundary: exactly at limit passes", () => {
  const result = evaluateChallenge(challengeTiers.scout, {
    pnlPercent: 10,
    maxDrawdownPercent: 5, // scout maxDrawdown is 5
    dailyLossPercent: 2,
    activeDays: 5,
    totalDays: 7,
    winRate: 55,
  });
  assert.equal(result.passed, true);
});

test("evaluateChallenge AT drawdown boundary: one tick over limit fails", () => {
  const result = evaluateChallenge(challengeTiers.scout, {
    pnlPercent: 10,
    maxDrawdownPercent: 5.01,
    dailyLossPercent: 2,
    activeDays: 5,
    totalDays: 7,
    winRate: 55,
  });
  assert.equal(result.passed, false);
  assert.match(result.reason, /drawdown/i);
});

test("evaluateChallenge rejects trades on disallowed markets for specialist tiers", () => {
  const forexTier = {
    ...challengeTiers.scout,
    allowedMarkets: specialistChallenges.forex.markets, // ["EUR/USD","GBP/USD","USD/JPY"]
  };
  const tradesWithRogue = [
    { market: "EUR/USD" },
    { market: "BTC" }, // not in forex list
  ];
  const result = evaluateChallenge(forexTier, {
    pnlPercent: 10,
    maxDrawdownPercent: 3,
    dailyLossPercent: 2,
    activeDays: 5,
    totalDays: 7,
    winRate: 55,
  }, tradesWithRogue);
  assert.equal(result.passed, false);
  assert.match(result.reason, /specialist/i);
  assert.match(result.reason, /BTC/);
});

test("evaluateChallenge passes specialist tier when all trades are on allowed markets", () => {
  const cryptoTier = {
    ...challengeTiers.scout,
    allowedMarkets: specialistChallenges.crypto.markets, // ["BTC","SOL","BONK","ETH"]
  };
  const validTrades = [{ market: "BTC" }, { market: "ETH" }, { market: "SOL" }, { market: "BTC" }, { market: "ETH" }];
  const result = evaluateChallenge(cryptoTier, {
    pnlPercent: 10,
    maxDrawdownPercent: 3,
    dailyLossPercent: 2,
    activeDays: 5,
    totalDays: 7,
    winRate: 55,
    tradeCount: 5,
  }, validTrades);
  assert.equal(result.passed, true);
});

test("computeDrawdownFromHWM returns correct peak-to-trough percentage", () => {
  // Peak at 1200, trough at 900: drawdown = (1200-900)/1200 = 25%
  const history = [1000, 1100, 1200, 1050, 900, 950];
  const dd = computeDrawdownFromHWM(history);
  assert.equal(dd, 25);
});

test("computeDrawdownFromHWM returns 0 for monotonically increasing equity", () => {
  const dd = computeDrawdownFromHWM([1000, 1050, 1100, 1200]);
  assert.equal(dd, 0);
});

test("computeDrawdownFromHWM returns 0 for empty history", () => {
  assert.equal(computeDrawdownFromHWM([]), 0);
});

test("evaluateDailyLoss detects breach when a single day exceeds the limit", () => {
  // Starting equity 10000, day 2 has a loss of 400 = 4% > 3% limit
  const result = evaluateDailyLoss(10000, [100, -400, 50, -20], 3);
  assert.equal(result.breached, true);
  assert.equal(result.worstDayIndex, 1);
  assert.equal(result.worstDayPercent, 4);
});

test("evaluateDailyLoss passes when all days are within the limit", () => {
  const result = evaluateDailyLoss(10000, [100, -200, 50, -250], 3);
  assert.equal(result.breached, false);
  assert.equal(result.worstDayPercent, 2.5);
});

test("evaluateDailyLoss handles all-gain days with no breach", () => {
  const result = evaluateDailyLoss(10000, [100, 200, 300], 3);
  assert.equal(result.breached, false);
  assert.equal(result.worstDayPercent, 0);
});
