import assert from "node:assert/strict";
import test from "node:test";

import {
  generatePropNarrativeBeats,
  findCohortGoldenTrade,
} from "../lib/competition/narrative.ts";
import type { CompetitionCohortView, RiskEvent } from "../lib/competition/types.ts";
import { RISK_EVENT_CATALOG } from "../lib/competition/risk-events.ts";

function makeMockCohort(): CompetitionCohortView {
  return {
    id: "test-cohort",
    name: "Test Cohort",
    preset: { id: "test", name: "Test", focus: "Test", tagline: "Test", questRewardPoints: 0, streakMultiplier: 1, raffleTickets: 0 },
    state: "live",
    startTime: "2026-03-19T08:00:00.000Z",
    endTime: "2026-03-22T08:00:00.000Z",
    narrative: "Test narrative",
    rewardPoolUsd: 5000,
    entryFeeUsd: 25,
    participantCap: 128,
    enrolledCount: 5,
    standings: [
      { wallet: "a", displayName: "Alpha", badge: "Test", rank: 1, tournamentScore: 180, pnlPercent: 22, volumeUsd: 200000, winRate: 65, consistencyScore: 90, maxDrawdownPercent: 2.5, attainedAt: "2026-03-20T00:00:00.000Z", eligible: true, questRewardPoints: 0, raffleTicketsAwarded: 0 },
      { wallet: "b", displayName: "Beta", badge: "Test", rank: 2, tournamentScore: 160, pnlPercent: 18, volumeUsd: 180000, winRate: 60, consistencyScore: 85, maxDrawdownPercent: 3.5, attainedAt: "2026-03-20T00:00:00.000Z", eligible: true, questRewardPoints: 0, raffleTicketsAwarded: 0 },
      { wallet: "c", displayName: "Gamma", badge: "Test", rank: 3, tournamentScore: 140, pnlPercent: 15, volumeUsd: 160000, winRate: 55, consistencyScore: 80, maxDrawdownPercent: 4.0, attainedAt: "2026-03-20T00:00:00.000Z", eligible: true, questRewardPoints: 0, raffleTicketsAwarded: 0 },
    ],
    rewardPreview: [],
    abuseResults: [],
  };
}

test("generates narrative beats for a cohort", () => {
  const cohort = makeMockCohort();
  const beats = generatePropNarrativeBeats(cohort, [], []);
  assert.ok(beats.length > 0, "Should generate some beats");
});

test("beats are sorted by severity then timestamp", () => {
  const cohort = makeMockCohort();
  const riskEvents: RiskEvent[] = [
    { ...RISK_EVENT_CATALOG.flash_crash, triggeredAt: new Date().toISOString() },
  ];
  const beats = generatePropNarrativeBeats(cohort, [], riskEvents);

  const severityOrder = { legendary: 0, hype: 1, normal: 2 };
  for (let i = 1; i < beats.length; i++) {
    const prev = severityOrder[beats[i - 1].severity];
    const curr = severityOrder[beats[i].severity];
    if (prev === curr) {
      assert.ok(
        beats[i - 1].timestamp >= beats[i].timestamp,
        "Same severity should be sorted by timestamp descending"
      );
    } else {
      assert.ok(prev <= curr, "Higher severity should come first");
    }
  }
});

test("golden trade beat is generated when provided", () => {
  const cohort = makeMockCohort();
  const golden = {
    traderId: "a",
    displayName: "Alpha",
    market: "BTC-PERP",
    direction: "long" as const,
    pnlUsd: 5000,
    pnlPercent: 22,
    leverage: 10,
    cohortContext: "test",
  };

  const beats = generatePropNarrativeBeats(cohort, [], [], golden);
  const goldenBeat = beats.find((b) => b.type === "golden-trade");
  assert.ok(goldenBeat, "Should have a golden trade beat");
  assert.ok(goldenBeat!.headline.includes("Alpha"));
});

test("risk event survivor beats are generated", () => {
  const cohort = makeMockCohort();
  const riskEvents: RiskEvent[] = [
    { ...RISK_EVENT_CATALOG.flash_crash, triggeredAt: new Date().toISOString() },
  ];

  const beats = generatePropNarrativeBeats(cohort, [], riskEvents);
  const survivors = beats.filter((b) => b.type === "risk-event-survivor");
  assert.ok(survivors.length > 0, "Should have survivor beats");
});

test("findCohortGoldenTrade selects highest PnL trader", () => {
  const standings = [
    { wallet: "a", displayName: "Alpha", badge: "", rank: 1, tournamentScore: 180, pnlPercent: 22, volumeUsd: 200000, winRate: 65, consistencyScore: 90, maxDrawdownPercent: 2.5, attainedAt: "", eligible: true, questRewardPoints: 0, raffleTicketsAwarded: 0 },
    { wallet: "b", displayName: "Beta", badge: "", rank: 2, tournamentScore: 160, pnlPercent: 18, volumeUsd: 180000, winRate: 60, consistencyScore: 85, maxDrawdownPercent: 3.5, attainedAt: "", eligible: true, questRewardPoints: 0, raffleTicketsAwarded: 0 },
  ];

  const golden = findCohortGoldenTrade("test", standings);
  assert.ok(golden);
  assert.equal(golden!.traderId, "a");
  assert.equal(golden!.pnlPercent, 22);
});

test("findCohortGoldenTrade returns null for empty standings", () => {
  const golden = findCohortGoldenTrade("empty", []);
  assert.equal(golden, null);
});

test("findCohortGoldenTrade returns null when all PnL is <= 0", () => {
  const standings = [
    { wallet: "a", displayName: "Alpha", badge: "", rank: 1, tournamentScore: 0, pnlPercent: -5, volumeUsd: 0, winRate: 0, consistencyScore: 0, maxDrawdownPercent: 0, attainedAt: "", eligible: true, questRewardPoints: 0, raffleTicketsAwarded: 0 },
  ];
  const golden = findCohortGoldenTrade("negative", standings);
  assert.equal(golden, null);
});
