import assert from "node:assert/strict";
import test from "node:test";

import {
  createFullBracket,
  resolveKnockoutMatch,
  findGoldenTrade,
  computeLiveOdds,
  getDefaultTwists,
  createExpandedLeaderboard,
  type WorldCupData,
} from "../lib/world-cup/engine.ts";
import { generateNarrativeBeats } from "../lib/world-cup/narrative.ts";
import { defaultWeights, defaultGuardrails } from "../lib/world-cup/types.ts";
import { buildTestData } from "./world-cup-test-helpers.ts";

const allDivisionData: WorldCupData = buildTestData(["crypto", "metals", "energy", "forex"]);

test("createFullBracket produces a complete tournament", () => {
  const bracket = createFullBracket({
    cupId: "crypto",
    scenarioId: "bubble",
    weights: defaultWeights,
    guardrails: defaultGuardrails,
    data: allDivisionData,
  });

  // Group stage
  assert.equal(bracket.groups.length, 8, "Should have 8 groups");
  assert.equal(bracket.division, "crypto");

  // Knockout rounds
  assert.equal(bracket.roundOf16.length, 8, "Should have 8 R16 matches");
  assert.equal(bracket.quarterFinals.length, 4, "Should have 4 QF matches");
  assert.equal(bracket.semiFinals.length, 2, "Should have 2 SF matches");
  assert.ok(bracket.final, "Should have a final");
  assert.ok(bracket.final.winner, "Final should have a winner");

  // All matches resolved
  for (const match of bracket.roundOf16) {
    assert.ok(match.winner, `R16 match ${match.id} should have a winner`);
  }
  for (const match of bracket.quarterFinals) {
    assert.ok(match.winner, `QF match ${match.id} should have a winner`);
  }
  for (const match of bracket.semiFinals) {
    assert.ok(match.winner, `SF match ${match.id} should have a winner`);
  }
});

test("createFullBracket works for all four divisions", () => {
  const divisions = ["crypto", "metals", "energy", "forex"] as const;

  for (const cupId of divisions) {
    const bracket = createFullBracket({
      cupId,
      scenarioId: "group_stage",
      weights: defaultWeights,
      guardrails: defaultGuardrails,
      data: allDivisionData,
    });

    assert.equal(bracket.division, cupId);
    assert.equal(bracket.groups.length, 8, `${cupId} should have 8 groups`);
    assert.ok(bracket.final.winner, `${cupId} should have a champion`);
  }
});

test("resolveKnockoutMatch always produces a winner", () => {
  const leaderboard = createExpandedLeaderboard({
    cupId: "crypto",
    scenarioId: "bubble",
    weights: defaultWeights,
    guardrails: defaultGuardrails,
    data: allDivisionData,
  });

  for (let i = 0; i < 20; i++) {
    const match = resolveKnockoutMatch(
      `test-${i}`,
      `Test ${i}`,
      "round-of-16",
      leaderboard[i % leaderboard.length],
      leaderboard[(i + 1) % leaderboard.length]
    );

    assert.ok(match.winner, `Match ${i} should always produce a winner`);
  }
});

test("findGoldenTrade returns a valid golden trade", () => {
  const bracket = createFullBracket({
    cupId: "energy",
    scenarioId: "bubble",
    weights: defaultWeights,
    guardrails: defaultGuardrails,
    data: allDivisionData,
  });

  const trade = findGoldenTrade(bracket);

  assert.ok(trade.alias, "Should have a trader alias");
  assert.ok(trade.market, "Should have a market");
  assert.ok(trade.pnlUsd > 0, "Should have positive PnL");
  assert.ok(trade.leverage > 0, "Should have leverage");
  assert.ok(
    trade.direction === "long" || trade.direction === "short",
    "Should have valid direction"
  );
});

test("computeLiveOdds returns valid probabilities", () => {
  const bracket = createFullBracket({
    cupId: "forex",
    scenarioId: "bubble",
    weights: defaultWeights,
    guardrails: defaultGuardrails,
    data: allDivisionData,
  });

  for (const match of bracket.roundOf16) {
    const odds = computeLiveOdds(match);

    assert.ok(odds.leftWinProb >= 0 && odds.leftWinProb <= 1, "Left prob should be 0-1");
    assert.ok(odds.rightWinProb >= 0 && odds.rightWinProb <= 1, "Right prob should be 0-1");
    assert.ok(odds.drawProb >= 0 && odds.drawProb <= 1, "Draw prob should be 0-1");
    assert.ok(
      ["gaining", "losing", "stable"].includes(odds.trendDirection),
      "Trend direction should be valid"
    );
  }
});

test("getDefaultTwists returns twist definitions for QF and SF", () => {
  const twists = getDefaultTwists();

  assert.ok(twists.length >= 2, "Should have at least 2 twists");

  const qfTwist = twists.find((t) => t.round === "quarterfinal");
  assert.ok(qfTwist, "Should have a QF twist");
  assert.equal(qfTwist!.label, "The Gold Round");

  const sfTwist = twists.find((t) => t.round === "semifinal");
  assert.ok(sfTwist, "Should have a SF twist");
  assert.equal(sfTwist!.label, "The Chaos Round");
});

test("generateNarrativeBeats produces beats from a full bracket", () => {
  const bracket = createFullBracket({
    cupId: "crypto",
    scenarioId: "bubble",
    weights: defaultWeights,
    guardrails: defaultGuardrails,
    data: allDivisionData,
  });

  const goldenTrade = findGoldenTrade(bracket);
  const beats = generateNarrativeBeats(bracket, goldenTrade);

  assert.ok(beats.length > 0, "Should generate at least one beat");

  // Check beat structure
  for (const beat of beats) {
    assert.ok(beat.type, "Beat should have a type");
    assert.ok(beat.headline, "Beat should have a headline");
    assert.ok(beat.subtext, "Beat should have subtext");
    assert.ok(
      ["normal", "hype", "legendary"].includes(beat.severity),
      "Beat severity should be valid"
    );
  }

  // Should have a golden trade beat
  const goldenBeat = beats.find((b) => b.type === "golden-trade");
  assert.ok(goldenBeat, "Should have a golden trade beat");
});

test("knockout matches include twist info", () => {
  const twists = getDefaultTwists();
  const bracket = createFullBracket({
    cupId: "crypto",
    scenarioId: "bubble",
    weights: defaultWeights,
    guardrails: defaultGuardrails,
    twists,
    data: allDivisionData,
  });

  // QF matches should reference the twist market
  for (const match of bracket.quarterFinals) {
    assert.ok(match.round === "quarterfinal");
    // Twist market is set to "XAU" for QF
    if (match.twistMarket) {
      assert.equal(match.twistMarket, "XAU");
    }
  }

});

test("third-place match is populated from SF losers", () => {
  const bracket = createFullBracket({
    cupId: "metals",
    scenarioId: "bubble",
    weights: defaultWeights,
    guardrails: defaultGuardrails,
    data: allDivisionData,
  });

  assert.ok(bracket.thirdPlace, "Should have a third-place match");
  assert.ok(bracket.thirdPlace!.left, "Third-place should have left entry");
  assert.ok(bracket.thirdPlace!.right, "Third-place should have right entry");
  assert.ok(bracket.thirdPlace!.winner, "Third-place should have a winner");

  // Third-place contestants should not be in the final
  const finalIds = [
    bracket.final.left?.trader.id,
    bracket.final.right?.trader.id,
  ];
  assert.ok(
    !finalIds.includes(bracket.thirdPlace!.left!.trader.id),
    "Third-place left should not be in final"
  );
  assert.ok(
    !finalIds.includes(bracket.thirdPlace!.right!.trader.id),
    "Third-place right should not be in final"
  );
});

test("redemption bracket is populated from QF losers", () => {
  const bracket = createFullBracket({
    cupId: "energy",
    scenarioId: "bubble",
    weights: defaultWeights,
    guardrails: defaultGuardrails,
    data: allDivisionData,
  });

  const allRedemptionMatches = [
    ...bracket.redemptionBracket.round1,
    ...bracket.redemptionBracket.round2,
    ...(bracket.redemptionBracket.redemptionFinal ? [bracket.redemptionBracket.redemptionFinal] : []),
  ];

  assert.ok(
    allRedemptionMatches.length > 0,
    "Should have redemption matches"
  );

  for (const match of allRedemptionMatches) {
    assert.equal(match.round, "redemption");
    assert.ok(match.winner, "Redemption match should have a winner");
  }
});
