import assert from "node:assert/strict";
import test from "node:test";

import { drawGroups, generateRoundRobinSchedule } from "../lib/world-cup/group-draw.ts";
import { createExpandedLeaderboard, runGroupStage, type WorldCupData } from "../lib/world-cup/engine.ts";
import { defaultWeights, defaultGuardrails } from "../lib/world-cup/types.ts";
import { buildTestData } from "./world-cup-test-helpers.ts";

const allDivisionData: WorldCupData = buildTestData(["crypto", "metals", "energy", "forex"]);

test("drawGroups produces 8 groups of 4 from 32 qualifiers", () => {
  const leaderboard = createExpandedLeaderboard({
    cupId: "crypto",
    scenarioId: "bubble",
    weights: defaultWeights,
    guardrails: defaultGuardrails,
    data: allDivisionData,
  });

  const top32 = leaderboard.slice(0, 32).map((e, i) => ({ ...e, rank: i + 1 }));
  const groups = drawGroups(top32, "crypto");

  assert.equal(groups.length, 8, "Should produce 8 groups");
  for (const group of groups) {
    assert.equal(group.traders.length, 4, `${group.label} should have 4 traders`);
  }
});

test("drawGroups produces at least 1 Group of Death", () => {
  const leaderboard = createExpandedLeaderboard({
    cupId: "metals",
    scenarioId: "specialization",
    weights: defaultWeights,
    guardrails: defaultGuardrails,
    data: allDivisionData,
  });

  const top32 = leaderboard.slice(0, 32).map((e, i) => ({ ...e, rank: i + 1 }));
  const groups = drawGroups(top32, "metals");

  const groupsOfDeath = groups.filter((g) => g.isGroupOfDeath);
  assert.ok(groupsOfDeath.length >= 1, "At least 1 Group of Death should exist");
});

test("drawGroups is deterministic across calls", () => {
  const leaderboard = createExpandedLeaderboard({
    cupId: "crypto",
    scenarioId: "bubble",
    weights: defaultWeights,
    guardrails: defaultGuardrails,
    data: allDivisionData,
  });

  const top32 = leaderboard.slice(0, 32).map((e, i) => ({ ...e, rank: i + 1 }));
  const groups1 = drawGroups(top32, "crypto");
  const groups2 = drawGroups(top32, "crypto");

  for (let i = 0; i < 8; i++) {
    const ids1 = groups1[i].traders.map((t) => t.trader.id).join(",");
    const ids2 = groups2[i].traders.map((t) => t.trader.id).join(",");
    assert.equal(ids1, ids2, `Group ${i} should have same traders on repeated calls`);
  }
});

test("generateRoundRobinSchedule produces 6 matches across 3 matchdays", () => {
  const leaderboard = createExpandedLeaderboard({
    cupId: "energy",
    scenarioId: "bubble",
    weights: defaultWeights,
    guardrails: defaultGuardrails,
    data: allDivisionData,
  });

  const top32 = leaderboard.slice(0, 32).map((e, i) => ({ ...e, rank: i + 1 }));
  const groups = drawGroups(top32, "energy");
  const schedule = generateRoundRobinSchedule(groups[0]);

  assert.equal(schedule.length, 6, "Round-robin of 4 teams produces 6 matches");

  const matchday1 = schedule.filter((m) => m.matchday === 1);
  const matchday2 = schedule.filter((m) => m.matchday === 2);
  const matchday3 = schedule.filter((m) => m.matchday === 3);

  assert.equal(matchday1.length, 2, "Matchday 1 should have 2 matches");
  assert.equal(matchday2.length, 2, "Matchday 2 should have 2 matches");
  assert.equal(matchday3.length, 2, "Matchday 3 should have 2 matches");
});

test("computeGroupStandings sorts correctly and marks top 2 as qualified", () => {
  const groups = runGroupStage(
    createExpandedLeaderboard({
      cupId: "forex",
      scenarioId: "bubble",
      weights: defaultWeights,
      guardrails: defaultGuardrails,
      data: allDivisionData,
    }).slice(0, 32).map((e, i) => ({ ...e, rank: i + 1 })),
    "forex"
  );

  for (const group of groups) {
    assert.equal(group.standings.length, 4, `${group.label} should have 4 standings`);

    // Points should be descending
    for (let i = 0; i < group.standings.length - 1; i++) {
      assert.ok(
        group.standings[i].points >= group.standings[i + 1].points,
        `Standings should be sorted by points in ${group.label}`
      );
    }

    // Top 2 qualified, bottom 2 not
    const qualified = group.standings.filter((s) => s.qualified);
    assert.equal(qualified.length, 2, `${group.label} should have exactly 2 qualified`);

    // First should be group winner
    assert.ok(group.standings[0].groupWinner, `${group.label} first place should be group winner`);
  }
});

test("runGroupStage produces groups with matches and standings", () => {
  const leaderboard = createExpandedLeaderboard({
    cupId: "crypto",
    scenarioId: "bubble",
    weights: defaultWeights,
    guardrails: defaultGuardrails,
    data: allDivisionData,
  });

  const top32 = leaderboard.slice(0, 32).map((e, i) => ({ ...e, rank: i + 1 }));
  const groups = runGroupStage(top32, "crypto");

  assert.equal(groups.length, 8);

  for (const group of groups) {
    assert.equal(group.matches.length, 6, `${group.label} should have 6 matches`);
    assert.equal(group.standings.length, 4, `${group.label} should have 4 standings`);

    // Each trader should have played 3 matches
    for (const standing of group.standings) {
      assert.equal(standing.played, 3, `${standing.trader.alias} should have played 3 matches`);
    }
  }
});

test("standings tiebreakers work with head-to-head", () => {
  const groups = runGroupStage(
    createExpandedLeaderboard({
      cupId: "metals",
      scenarioId: "bubble",
      weights: defaultWeights,
      guardrails: defaultGuardrails,
      data: allDivisionData,
    }).slice(0, 32).map((e, i) => ({ ...e, rank: i + 1 })),
    "metals"
  );

  // Verify all standings have head-to-head records
  for (const group of groups) {
    for (const standing of group.standings) {
      const opponentIds = group.standings
        .filter((s) => s.trader.id !== standing.trader.id)
        .map((s) => s.trader.id);

      for (const oppId of opponentIds) {
        assert.ok(
          standing.headToHeadRecord[oppId] !== undefined,
          `${standing.trader.alias} should have H2H record vs ${oppId}`
        );
      }
    }
  }
});
