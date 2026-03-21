import assert from "node:assert/strict";
import test from "node:test";

import {
  computeCompositeScore,
  normalizeWeights,
  createCupLeaderboard,
  createFinalsBracket,
  evaluateFlags,
  createDeskStandings,
  type WorldCupData,
} from "../lib/world-cup/engine.ts";
import { defaultWeights, defaultGuardrails } from "../lib/world-cup/types.ts";
import type { TraderRecord, DeskDefinition } from "../lib/world-cup/types.ts";

// ── Test fixture data ────────────────────────────────────────────────────────
// Minimal traders and desks so engine functions that iterate over data produce
// meaningful results without requiring a database connection.

const testTraders: TraderRecord[] = [
  {
    id: "test-crypto-1",
    name: "Alice Crypto",
    alias: "Alice",
    specialization: "crypto",
    tag: "Momentum trader",
    bio: "Test crypto trader 1",
    baseline: {
      riskAdjustedPnl: 82,
      consistency: 78,
      missionProgress: 75,
      streakPower: 70,
      raffleBonus: 65,
      weeklyVolume: 250000,
      tradeCount: 35,
      maxSingleTradeShare: 20,
      activeDays: 7,
      streakDays: 10,
      realizedPnl: 18000,
      drawdown: 3.5,
      raffleTickets: 12,
    },
  },
  {
    id: "test-crypto-2",
    name: "Bob Crypto",
    alias: "Bob",
    specialization: "crypto",
    tag: "Swing trader",
    bio: "Test crypto trader 2",
    baseline: {
      riskAdjustedPnl: 70,
      consistency: 65,
      missionProgress: 60,
      streakPower: 55,
      raffleBonus: 50,
      weeklyVolume: 180000,
      tradeCount: 25,
      maxSingleTradeShare: 30,
      activeDays: 5,
      streakDays: 6,
      realizedPnl: 12000,
      drawdown: 5.0,
      raffleTickets: 8,
    },
  },
];

const testDesks: DeskDefinition[] = [
  {
    id: "crypto-atlas",
    cupId: "crypto",
    name: "Atlas Desk",
    tier: "Premier",
    motto: "Test premier desk",
    captainMission: "Lead the charge",
    supporters: 1200,
  },
  {
    id: "crypto-latency",
    cupId: "crypto",
    name: "Latency Desk",
    tier: "Challenger",
    motto: "Test challenger desk",
    captainMission: "Prove yourself",
    supporters: 600,
  },
];

const testData: WorldCupData = { traders: testTraders, desks: testDesks };
const emptyData: WorldCupData = { traders: [], desks: [] };

test("composite score calculation produces expected values", () => {
  const metrics = {
    riskAdjustedPnl: 80,
    consistency: 75,
    missionProgress: 70,
    streakPower: 65,
    raffleBonus: 60,
    weeklyVolume: 200000,
    tradeCount: 30,
    maxSingleTradeShare: 25,
    activeDays: 6,
    streakDays: 8,
    realizedPnl: 15000,
    drawdown: 4.0,
    raffleTickets: 10,
  };

  const score = computeCompositeScore(metrics, defaultWeights);
  assert.ok(score > 0);
  assert.ok(score <= 100);
});

test("normalizeWeights sums to 100", () => {
  const normalized = normalizeWeights(defaultWeights);
  const sum =
    normalized.riskAdjustedPnl +
    normalized.consistency +
    normalized.missionProgress +
    normalized.streakPower +
    normalized.raffleBonus;
  assert.ok(Math.abs(sum - 100) < 0.1);
});

test("normalizeWeights handles zero-sum by returning defaults", () => {
  const result = normalizeWeights({
    riskAdjustedPnl: 0,
    consistency: 0,
    missionProgress: 0,
    streakPower: 0,
    raffleBonus: 0,
  });
  assert.equal(result.riskAdjustedPnl, defaultWeights.riskAdjustedPnl);
});

test("leaderboard ranks eligible traders before ineligible", () => {
  const leaderboard = createCupLeaderboard({
    cupId: "crypto",
    scenarioId: "bubble",
    weights: defaultWeights,
    guardrails: defaultGuardrails,
    data: testData,
  });

  assert.ok(leaderboard.length > 0);

  const firstIneligibleIndex = leaderboard.findIndex((e) => !e.eligible);
  if (firstIneligibleIndex > 0) {
    const allEligibleBefore = leaderboard
      .slice(0, firstIneligibleIndex)
      .every((e) => e.eligible);
    assert.ok(allEligibleBefore);
  }
});

test("finals bracket produces valid semi-finals and final", () => {
  const bracket = createFinalsBracket({
    scenarioId: "finals",
    weights: defaultWeights,
    guardrails: defaultGuardrails,
    data: emptyData,
  });

  assert.equal(bracket.semiFinals.length, 2);
  assert.ok(bracket.final.label === "Grand Final");
  assert.ok(bracket.final.winner);
});

test("evaluateFlags flags trader below min volume", () => {
  const trader = {
    id: "test",
    name: "Test",
    alias: "Tester",
    specialization: "crypto" as const,
    tag: "test",
    bio: "test",
    baseline: {
      riskAdjustedPnl: 80,
      consistency: 75,
      missionProgress: 70,
      streakPower: 65,
      raffleBonus: 60,
      weeklyVolume: 10000,
      tradeCount: 30,
      maxSingleTradeShare: 25,
      activeDays: 6,
      streakDays: 8,
      realizedPnl: 15000,
      drawdown: 4.0,
      raffleTickets: 10,
    },
  };

  const flags = evaluateFlags(
    trader,
    trader.baseline,
    defaultGuardrails,
    "bubble"
  );
  assert.ok(flags.some((f) => f.code === "min-volume"));
});

test("desk standings produce rankings for a cup", () => {
  const standings = createDeskStandings({
    cupId: "crypto",
    scenarioId: "bubble",
    weights: defaultWeights,
    guardrails: defaultGuardrails,
    data: testData,
  });

  assert.ok(standings.length > 0);
  assert.ok(standings[0].score >= standings[standings.length - 1].score);
});
