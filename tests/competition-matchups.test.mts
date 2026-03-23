import assert from "node:assert/strict";
import test from "node:test";

import {
  generateCohortMatchups,
  resolveHeadToHead,
  createLivePnlRace,
  computeMatchupOdds,
} from "../lib/competition/matchups.ts";
import type { StandingsEntry } from "../lib/competition/types.ts";

function makeEntry(wallet: string, score: number, pnl: number): StandingsEntry {
  return {
    wallet,
    displayName: wallet,
    badge: "Test",
    rank: 0,
    tournamentScore: score,
    pnlPercent: pnl,
    volumeUsd: 150000,
    winRate: 55,
    consistencyScore: 80,
    maxDrawdownPercent: 4,
    attainedAt: "2026-03-20T00:00:00.000Z",
    eligible: true,
    questRewardPoints: 0,
    raffleTicketsAwarded: 0,
  };
}

test("generates deterministic matchups for a cohort", () => {
  const standings = [
    makeEntry("trader-1", 150, 18),
    makeEntry("trader-2", 140, 16),
    makeEntry("trader-3", 130, 14),
    makeEntry("trader-4", 120, 12),
  ];

  const first = generateCohortMatchups(standings, "test-cohort");
  const second = generateCohortMatchups(standings, "test-cohort");

  assert.equal(first.length, second.length);
  for (let i = 0; i < first.length; i++) {
    assert.equal(first[i].traderA, second[i].traderA);
    assert.equal(first[i].traderB, second[i].traderB);
  }
});

test("all eligible traders are paired", () => {
  const standings = Array.from({ length: 8 }, (_, i) =>
    makeEntry(`trader-${i}`, 150 - i * 10, 18 - i * 2)
  );

  const matchups = generateCohortMatchups(standings, "pair-test");
  const paired = new Set(matchups.flatMap((m) => [m.traderA, m.traderB]));
  assert.equal(paired.size, 8, "All 8 traders should be paired");
  assert.equal(matchups.length, 4, "Should have 4 matchups for 8 traders");
});

test("head-to-head resolves with expected winner", () => {
  const strong = makeEntry("strong", 180, 22);
  const weak = makeEntry("weak", 100, 10);

  const result = resolveHeadToHead(strong, weak, []);
  assert.equal(result.winnerId, "strong");
  assert.equal(result.loserId, "weak");
  assert.ok(result.marginScore > 0);
});

test("live P&L race is ordered by PnL", () => {
  const standings = [
    makeEntry("a", 150, 18),
    makeEntry("b", 140, 22),
    makeEntry("c", 130, 15),
  ];

  const race = createLivePnlRace(standings, "race-test");
  assert.equal(race.entries[0].wallet, "b", "Highest PnL should be first");
  assert.ok(race.entries.every((e) => ["surging", "stable", "fading"].includes(e.momentum)));
});

test("matchup odds sum approximately to 1.0", () => {
  const a = makeEntry("a", 150, 18);
  const b = makeEntry("b", 140, 16);

  const odds = computeMatchupOdds(a, b);
  const sum = odds.aWinProb + odds.bWinProb + odds.drawProb;

  assert.ok(
    Math.abs(sum - 1.0) < 0.01,
    `Odds should sum to ~1.0, got ${sum}`
  );
  assert.ok(odds.aWinProb > odds.bWinProb, "Higher score should have higher win prob");
});

test("empty standings returns no matchups", () => {
  const matchups = generateCohortMatchups([], "empty");
  assert.equal(matchups.length, 0);
});

test("single trader returns no matchups", () => {
  const matchups = generateCohortMatchups(
    [makeEntry("solo", 150, 18)],
    "solo"
  );
  assert.equal(matchups.length, 0);
});
