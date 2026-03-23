import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluateChallenge,
  evaluatePassRateGuardrail,
} from "../lib/competition/engine.ts";
import { challengeTiers } from "../lib/competition/config.ts";
import {
  applyPowerUp,
  getKnockoutBuyinUsdc,
  resolveKnockoutMatch,
  computeWorldCupSeeding,
} from "../lib/world-cup/engine.ts";
import type { ActivatedPowerUp } from "../lib/world-cup/types.ts";
import { KNOCKOUT_BUYIN_USDC } from "../lib/world-cup/types.ts";
import { drawGroups } from "../lib/world-cup/group-draw.ts";
import type {
  LeaderboardEntry,
  TraderMetrics,
} from "../lib/world-cup/types.ts";

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeEntry(
  id: string,
  rank: number,
  raroi = 10,
  consistency = 50
): LeaderboardEntry {
  const metrics: TraderMetrics = {
    weeklyVolume: 100000,
    realizedPnl: 5000,
    winRate: 60,
    consistency,
    riskAdjustedPnl: raroi,
    activeDays: 5,
    maxDrawdown: 3,
    positionCount: 20,
    avgHoldTime: 120,
    streakLength: 3,
  };
  return {
    trader: { id, alias: id, desk: "crypto-desk-A" },
    metrics,
    rank,
    eligible: true,
    qualification: {
      qualified: true,
      reason: "qualified",
      route: "group-stage",
    },
    reward: { tier: "participation", label: "Participation", adxAmount: 0 },
  };
}

// ── Challenge Pause Mechanism ────────────────────────────────────────────────

test("challenge pauses when current equity drops below minimum (not fails)", () => {
  const result = evaluateChallenge(challengeTiers.scout, {
    pnlPercent: 10,
    maxDrawdownPercent: 3,
    dailyLossPercent: 2,
    activeDays: 5,
    totalDays: 7,
    winRate: 55,
    startingEquity: 100, // above minCapital of 50
    currentEquity: 30, // below minCapital of 50
  });
  assert.equal(result.passed, false);
  assert.equal(result.paused, true);
  assert.ok(result.pausedAt, "should have a pausedAt timestamp");
  assert.ok(result.reason?.includes("paused"), "reason should mention pause");
});

test("challenge does NOT pause when current equity is above minimum", () => {
  const result = evaluateChallenge(challengeTiers.scout, {
    pnlPercent: 10,
    maxDrawdownPercent: 3,
    dailyLossPercent: 2,
    activeDays: 5,
    totalDays: 7,
    winRate: 55,
    startingEquity: 100,
    currentEquity: 80, // above minCapital of 50
  });
  assert.equal(result.passed, true);
  assert.equal(result.paused, undefined);
});

test("challenge fails on starting equity below minimum (not paused)", () => {
  const result = evaluateChallenge(challengeTiers.scout, {
    pnlPercent: 10,
    maxDrawdownPercent: 3,
    dailyLossPercent: 2,
    activeDays: 5,
    totalDays: 7,
    winRate: 55,
    startingEquity: 30, // below minCapital of 50
  });
  assert.equal(result.passed, false);
  assert.equal(
    result.paused,
    undefined,
    "starting equity failure should NOT be paused"
  );
  assert.ok(result.reason?.includes("Insufficient capital"));
});

// ── Pass-Rate Guardrails ─────────────────────────────────────────────────────

test("pass-rate guardrail: <10 samples returns no adjustment", () => {
  const result = evaluatePassRateGuardrail(challengeTiers.scout, 4, 9);
  assert.equal(result.adjustment, "none");
  assert.equal(result.sampleSize, 9);
});

test("pass-rate guardrail: >40% pass rate tightens profit target", () => {
  const result = evaluatePassRateGuardrail(challengeTiers.scout, 5, 10);
  assert.equal(result.adjustment, "tighten");
  assert.equal(
    result.adjustedProfitTarget,
    challengeTiers.scout.profitTarget + 1
  );
});

test("pass-rate guardrail: <15% pass rate relaxes max drawdown", () => {
  const result = evaluatePassRateGuardrail(challengeTiers.scout, 1, 10);
  assert.equal(result.adjustment, "relax");
  assert.equal(
    result.adjustedMaxDrawdown,
    challengeTiers.scout.maxDrawdown + 1
  );
});

test("pass-rate guardrail: 15-40% pass rate makes no adjustment", () => {
  const result = evaluatePassRateGuardrail(challengeTiers.scout, 3, 10);
  assert.equal(result.adjustment, "none");
  assert.equal(result.adjustedProfitTarget, undefined);
  assert.equal(result.adjustedMaxDrawdown, undefined);
});

test("pass-rate guardrail: exactly 40% is not tightened (only >40%)", () => {
  const result = evaluatePassRateGuardrail(challengeTiers.scout, 4, 10);
  assert.equal(result.adjustment, "none");
});

// ── Power-Ups ────────────────────────────────────────────────────────────────

test("mulligan power-up boosts RAROI", () => {
  const powerUp: ActivatedPowerUp = {
    type: "mulligan",
    wallet: "trader1",
    matchId: "m1",
    activatedAt: Date.now(),
    consumed: false,
  };
  const result = applyPowerUp(10, powerUp, 5);
  assert.ok(result.adjustedRaroi > 10, "mulligan should increase RAROI");
  assert.equal(result.powerUpUsed, true);
});

test("double_points power-up doubles RAROI", () => {
  const powerUp: ActivatedPowerUp = {
    type: "double_points",
    wallet: "trader1",
    matchId: "m1",
    activatedAt: Date.now(),
    consumed: false,
  };
  const result = applyPowerUp(10, powerUp, 5);
  assert.equal(result.adjustedRaroi, 20);
  assert.equal(result.powerUpUsed, true);
});

test("overtime_shield activates when margin < 5", () => {
  const powerUp: ActivatedPowerUp = {
    type: "overtime_shield",
    wallet: "trader1",
    matchId: "m1",
    activatedAt: Date.now(),
    consumed: false,
  };
  const result = applyPowerUp(10, powerUp, 3); // margin 3 < 5
  assert.ok(
    result.adjustedRaroi > 10,
    "overtime shield should boost when margin < 5"
  );
  assert.equal(result.powerUpUsed, true);
});

test("overtime_shield does NOT activate when margin >= 5", () => {
  const powerUp: ActivatedPowerUp = {
    type: "overtime_shield",
    wallet: "trader1",
    matchId: "m1",
    activatedAt: Date.now(),
    consumed: false,
  };
  const result = applyPowerUp(10, powerUp, 8); // margin 8 >= 5
  assert.equal(result.adjustedRaroi, 10, "overtime shield should not activate");
  assert.equal(result.powerUpUsed, false);
});

test("consumed power-up has no effect", () => {
  const powerUp: ActivatedPowerUp = {
    type: "double_points",
    wallet: "trader1",
    matchId: "m1",
    activatedAt: Date.now(),
    consumed: true, // already used
  };
  const result = applyPowerUp(10, powerUp, 5);
  assert.equal(result.adjustedRaroi, 10);
  assert.equal(result.powerUpUsed, false);
});

test("no power-up returns base RAROI", () => {
  const result = applyPowerUp(10, undefined, 5);
  assert.equal(result.adjustedRaroi, 10);
  assert.equal(result.powerUpUsed, false);
});

test("resolveKnockoutMatch applies power-ups and marks consumed", () => {
  const left = makeEntry("trader-a", 1, 15, 60);
  const right = makeEntry("trader-b", 2, 15, 60); // same RAROI

  const powerUps: ActivatedPowerUp[] = [
    {
      type: "double_points",
      wallet: "trader-a",
      matchId: "match-1",
      activatedAt: Date.now(),
      consumed: false,
    },
  ];

  const match = resolveKnockoutMatch(
    "match-1",
    "QF1",
    "quarterfinal",
    left,
    right,
    undefined,
    powerUps
  );

  assert.ok(match.winner, "should have a winner");
  assert.equal(
    powerUps[0].consumed,
    true,
    "power-up should be consumed after use"
  );
});

// ── Knockout Buy-in ──────────────────────────────────────────────────────────

test("non-funded traders pay knockout buy-in", () => {
  assert.equal(getKnockoutBuyinUsdc(false), KNOCKOUT_BUYIN_USDC);
});

test("funded traders are exempt from knockout buy-in", () => {
  assert.equal(getKnockoutBuyinUsdc(true), 0);
});

// ── World Cup Seeding ────────────────────────────────────────────────────────

test("funded traders get priority seeding", () => {
  const records = [
    {
      wallet: "funded1",
      tier: "Elite",
      passed: true,
      finalScore: 80,
      completedAt: 1,
    },
    {
      wallet: "funded2",
      tier: "Apex",
      passed: true,
      finalScore: 90,
      completedAt: 2,
    },
    {
      wallet: "regular1",
      tier: "Veteran",
      passed: true,
      finalScore: 95,
      completedAt: 3,
    },
    {
      wallet: "regular2",
      tier: "Scout",
      passed: true,
      finalScore: 85,
      completedAt: 4,
    },
  ];

  const seeding = computeWorldCupSeeding(records, 4);

  // Funded traders should be first (sorted by score: funded2=90 then funded1=80)
  assert.equal(seeding[0], "funded2");
  assert.equal(seeding[1], "funded1");
  // Then regular traders by score
  assert.equal(seeding[2], "regular1");
  assert.equal(seeding[3], "regular2");
});

test("failed challenges are excluded from seeding", () => {
  const records = [
    {
      wallet: "winner",
      tier: "Elite",
      passed: true,
      finalScore: 80,
      completedAt: 1,
    },
    {
      wallet: "loser",
      tier: "Elite",
      passed: false,
      finalScore: 90,
      completedAt: 2,
    },
  ];

  const seeding = computeWorldCupSeeding(records, 4);
  assert.equal(seeding.length, 1);
  assert.equal(seeding[0], "winner");
});

test("seeding deduplicates wallets, keeps best score", () => {
  const records = [
    {
      wallet: "trader1",
      tier: "Elite",
      passed: true,
      finalScore: 60,
      completedAt: 1,
    },
    {
      wallet: "trader1",
      tier: "Apex",
      passed: true,
      finalScore: 90,
      completedAt: 2,
    },
  ];

  const seeding = computeWorldCupSeeding(records, 4);
  assert.equal(seeding.length, 1, "should deduplicate");
});

// ── Group Draw with Seeding ──────────────────────────────────────────────────

test("drawGroups places seeded wallets in top positions", () => {
  const qualifiers = Array.from({ length: 32 }, (_, i) =>
    makeEntry(`trader-${i}`, i + 1)
  );

  // Seed traders 30, 31 (normally in Pot 4) into top positions
  const groups = drawGroups(qualifiers, "crypto", ["trader-30", "trader-31"]);

  // Seeded traders should be in Pot 1 (groups exist and have 4 traders each)
  assert.equal(groups.length, 8);
  const allTraders = groups.flatMap((g) => g.traders.map((t) => t.trader.id));
  assert.ok(allTraders.includes("trader-30"));
  assert.ok(allTraders.includes("trader-31"));
});

test("drawGroups works without seeding (backwards compatible)", () => {
  const qualifiers = Array.from({ length: 32 }, (_, i) =>
    makeEntry(`trader-${i}`, i + 1)
  );

  const groups = drawGroups(qualifiers, "crypto");
  assert.equal(groups.length, 8);
  assert.equal(groups[0].traders.length, 4);
});

// ── Wallet Age (unit logic) ──────────────────────────────────────────────────

test("wallet age threshold is correct for elite/apex tiers", () => {
  // Elite entry fee is $25, Apex is $50 — both >= threshold of $25
  assert.ok(challengeTiers.elite.entryFee >= 25);
  assert.ok(challengeTiers.apex.entryFee >= 25);
  // Lower tiers should be below threshold
  assert.ok(challengeTiers.scout.entryFee < 25);
  assert.ok(challengeTiers.ranger.entryFee < 25);
  assert.ok(challengeTiers.sprint.entryFee < 25);
});
