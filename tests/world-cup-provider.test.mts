import "dotenv/config";
import assert from "node:assert/strict";
import test from "node:test";

import {
  getWorldCupIntegrationStatus,
  getWorldCupSnapshot,
} from "../lib/world-cup/provider.ts";
import { defaultWeights, defaultGuardrails } from "../lib/world-cup/types.ts";

test("world cup integration status defaults to adrena", () => {
  const status = getWorldCupIntegrationStatus();
  assert.equal(status.provider, "adrena");
  assert.equal(status.configured, true);
});

test("world cup snapshot returns valid data for crypto cup", async () => {
  const snapshot = await getWorldCupSnapshot({
    cupId: "crypto",
    scenarioId: "bubble",
    weights: defaultWeights,
    guardrails: defaultGuardrails,
  });

  assert.ok(snapshot.leaderboard.length > 0);
  assert.ok(snapshot.bracket.semiFinals.length === 2);
  assert.ok(snapshot.simulation.metrics.length > 0);
  assert.ok(snapshot.payoutPreview.length > 0);
});

test("world cup snapshot works for all four cups", async () => {
  const cupIds = ["crypto", "metals", "energy", "forex"] as const;

  for (const cupId of cupIds) {
    const snapshot = await getWorldCupSnapshot({
      cupId,
      scenarioId: "specialization",
      weights: defaultWeights,
      guardrails: defaultGuardrails,
    });
    assert.ok(snapshot.leaderboard.length > 0, `${cupId} leaderboard should have entries`);
  }
});
