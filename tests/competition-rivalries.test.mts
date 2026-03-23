import assert from "node:assert/strict";
import test from "node:test";

import {
  detectRivalries,
  generateRivalryTag,
} from "../lib/competition/rivalries.ts";
import type { HeadToHeadMatch, PropRivalry } from "../lib/competition/types.ts";

function makeMatch(
  id: string,
  traderA: string,
  traderB: string,
  winnerId: string,
  isDraw = false
): HeadToHeadMatch {
  return {
    id,
    cohortId: "test-cohort",
    traderA,
    traderB,
    window: { start: "", end: "" },
    status: "completed",
    result: {
      winnerId,
      loserId: winnerId === traderA ? traderB : traderA,
      marginPnl: 2.5,
      marginScore: 5,
      isDraw,
    },
  };
}

test("detects rivalry from repeated matchups", () => {
  const matches = [
    makeMatch("m1", "alice", "bob", "alice"),
    makeMatch("m2", "alice", "bob", "bob"),
    makeMatch("m3", "alice", "bob", "alice"),
  ];

  const rivalries = detectRivalries(matches);
  assert.equal(rivalries.length, 1);
  assert.equal(rivalries[0].meetings, 3);
  assert.equal(rivalries[0].aWins, 2);
  assert.equal(rivalries[0].bWins, 1);
});

test("no rivalry for single meeting", () => {
  const matches = [makeMatch("m1", "alice", "bob", "alice")];
  const rivalries = detectRivalries(matches);
  assert.equal(rivalries.length, 0);
});

test("rivalries sorted by intensity descending", () => {
  const matches = [
    makeMatch("m1", "alice", "bob", "alice"),
    makeMatch("m2", "alice", "bob", "bob"),
    makeMatch("m3", "charlie", "dave", "charlie"),
    makeMatch("m4", "charlie", "dave", "dave"),
    makeMatch("m5", "charlie", "dave", "charlie"),
    makeMatch("m6", "charlie", "dave", "charlie"),
  ];

  const rivalries = detectRivalries(matches);
  assert.ok(rivalries.length >= 2);

  for (let i = 1; i < rivalries.length; i++) {
    assert.ok(
      rivalries[i - 1].intensity >= rivalries[i].intensity,
      "Should be sorted by intensity"
    );
  }
});

test("generates deterministic rivalry tags", () => {
  const base: PropRivalry = {
    walletA: "a",
    walletB: "b",
    meetings: 2,
    aWins: 1,
    bWins: 1,
    draws: 0,
    narrativeTag: "",
    intensity: 5,
  };

  const tag = generateRivalryTag(base);
  assert.equal(tag, "The Rematch");

  const bitter = { ...base, meetings: 5, aWins: 3, bWins: 2 };
  assert.equal(generateRivalryTag(bitter), "Bitter Rivals");

  const domination = { ...base, meetings: 3, aWins: 3, bWins: 0 };
  assert.equal(generateRivalryTag(domination), "David vs Goliath");

  const draws = { ...base, meetings: 3, aWins: 0, bWins: 1, draws: 2 };
  assert.equal(generateRivalryTag(draws), "Mirror Match");
});

test("handles draws correctly", () => {
  const matches = [
    makeMatch("m1", "alice", "bob", "alice", true),
    makeMatch("m2", "alice", "bob", "alice", true),
  ];

  const rivalries = detectRivalries(matches);
  assert.equal(rivalries.length, 1);
  assert.equal(rivalries[0].draws, 2);
  assert.equal(rivalries[0].aWins, 0);
  assert.equal(rivalries[0].bWins, 0);
});
