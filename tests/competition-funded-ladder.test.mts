import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluateFundedLevel,
  computePromotionProgress,
  FUNDED_LADDER,
} from "../lib/competition/funded-ladder.ts";

test("evaluates watchlist level at minimum thresholds", () => {
  const level = evaluateFundedLevel(900, 15, 1);
  assert.equal(level, "watchlist");
});

test("evaluates funded level at thresholds", () => {
  const level = evaluateFundedLevel(1150, 5, 2);
  assert.equal(level, "funded");
});

test("evaluates senior_funded level", () => {
  const level = evaluateFundedLevel(1800, 3, 4);
  assert.equal(level, "senior_funded");
});

test("evaluates captain level", () => {
  const level = evaluateFundedLevel(2500, 1, 6);
  assert.equal(level, "captain");
});

test("evaluates partner level", () => {
  const level = evaluateFundedLevel(4000, 1, 12);
  assert.equal(level, "partner");
});

test("insufficient weeks prevents promotion", () => {
  // High points but only 1 week — should be watchlist
  const level = evaluateFundedLevel(4000, 1, 1);
  assert.equal(level, "watchlist");
});

test("insufficient finish prevents promotion", () => {
  // High points and weeks but bad finish
  const level = evaluateFundedLevel(4000, 20, 12);
  assert.equal(level, "watchlist");
});

test("promotion progress is 1.0 at partner level", () => {
  const result = computePromotionProgress("partner", 5000, 1, 15);
  assert.equal(result.nextLevel, null);
  assert.equal(result.progress, 1);
});

test("promotion progress between 0 and 1 for active progression", () => {
  const result = computePromotionProgress("watchlist", 1000, 8, 1);
  assert.ok(result.progress >= 0);
  assert.ok(result.progress <= 1);
  assert.equal(result.nextLevel, "funded");
});

test("revenue share BPS increases with level", () => {
  for (let i = 1; i < FUNDED_LADDER.length; i++) {
    assert.ok(
      FUNDED_LADDER[i].revenueShareBps > FUNDED_LADDER[i - 1].revenueShareBps,
      "Revenue share should increase with level"
    );
  }
});

test("funded ladder has 5 levels", () => {
  assert.equal(FUNDED_LADDER.length, 5);
  assert.equal(FUNDED_LADDER[0].level, "watchlist");
  assert.equal(FUNDED_LADDER[4].level, "partner");
});

test("each level has increasing thresholds", () => {
  for (let i = 1; i < FUNDED_LADDER.length; i++) {
    assert.ok(
      FUNDED_LADDER[i].pointsThreshold > FUNDED_LADDER[i - 1].pointsThreshold,
      "Points should increase"
    );
    assert.ok(
      FUNDED_LADDER[i].revenueShareBps > FUNDED_LADDER[i - 1].revenueShareBps,
      "Revenue share should increase"
    );
  }
});
