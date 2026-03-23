import assert from "node:assert/strict";
import test from "node:test";

import {
  assignTraderToDesk,
  computeDeskStandings,
  deskDefinitions,
  resolveDeskMatchup,
} from "../lib/competition/desks.ts";
import type { StandingsEntry } from "../lib/competition/types.ts";

test("desk definitions has 8 desks", () => {
  assert.equal(deskDefinitions.length, 8);
});

test("trader is assigned to a desk based on tier", () => {
  const desk = assignTraderToDesk("test-wallet-123", "apex");
  assert.ok(desk, "Should return a desk for apex tier");
  assert.ok(desk.tierId === "apex", "Desk should match apex tier");
});

test("same wallet always gets same desk (deterministic)", () => {
  const first = assignTraderToDesk("wallet-abc", "elite");
  const second = assignTraderToDesk("wallet-abc", "elite");
  assert.equal(first?.id, second?.id);
});

test("desk standings are computed and sorted by score", () => {
  const standings: StandingsEntry[] = Array.from({ length: 10 }, (_, i) => ({
    wallet: `trader-desk-${i}`,
    displayName: `Trader ${i}`,
    badge: "Test",
    rank: i + 1,
    tournamentScore: 150 - i * 10,
    pnlPercent: 18 - i * 2,
    volumeUsd: 200000 - i * 10000,
    winRate: 60 - i * 2,
    consistencyScore: 85 - i * 3,
    maxDrawdownPercent: 3 + i * 0.5,
    attainedAt: "2026-03-20T00:00:00.000Z",
    eligible: true,
    questRewardPoints: 0,
    raffleTicketsAwarded: 0,
  }));

  const deskStandings = computeDeskStandings(standings, "desk-test");

  // Should have some desks populated
  assert.ok(deskStandings.length > 0, "Should have desk standings");

  // Sorted by deskScore descending
  for (let i = 1; i < deskStandings.length; i++) {
    assert.ok(
      deskStandings[i - 1].deskScore >= deskStandings[i].deskScore,
      "Standings should be sorted by desk score"
    );
  }
});

test("desk standings have valid promotion values", () => {
  const standings: StandingsEntry[] = Array.from({ length: 6 }, (_, i) => ({
    wallet: `trader-promo-${i}`,
    displayName: `Trader ${i}`,
    badge: "Test",
    rank: i + 1,
    tournamentScore: 150 - i * 10,
    pnlPercent: 18 - i * 2,
    volumeUsd: 200000,
    winRate: 60,
    consistencyScore: 85,
    maxDrawdownPercent: 4,
    attainedAt: "2026-03-20T00:00:00.000Z",
    eligible: true,
    questRewardPoints: 0,
    raffleTicketsAwarded: 0,
  }));

  const deskStandings = computeDeskStandings(standings, "promo-test");
  for (const ds of deskStandings) {
    assert.ok(
      ["promoted", "relegated", "stable"].includes(ds.promotion),
      `Invalid promotion value: ${ds.promotion}`
    );
  }
});

test("desk matchup resolves with winner by score", () => {
  const standings: StandingsEntry[] = Array.from({ length: 10 }, (_, i) => ({
    wallet: `trader-matchup-${i}`,
    displayName: `Trader ${i}`,
    badge: "Test",
    rank: i + 1,
    tournamentScore: 150 - i * 10,
    pnlPercent: 18 - i * 2,
    volumeUsd: 200000,
    winRate: 60,
    consistencyScore: 85,
    maxDrawdownPercent: 4,
    attainedAt: "2026-03-20T00:00:00.000Z",
    eligible: true,
    questRewardPoints: 0,
    raffleTicketsAwarded: 0,
  }));

  const deskStandings = computeDeskStandings(standings, "desk-matchup-test");
  if (deskStandings.length >= 2) {
    const result = resolveDeskMatchup(deskStandings[0], deskStandings[1]);
    assert.ok(result.winner, "Should have a winner");
    assert.ok(result.margin >= 0, "Margin should be non-negative");
  }
});
