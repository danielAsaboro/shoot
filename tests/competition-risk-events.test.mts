import assert from "node:assert/strict";
import test from "node:test";

import {
  RISK_EVENT_CATALOG,
  generateRiskScenario,
  applyRiskEventModifiers,
  getActiveRiskEvents,
  getChallengeModifiers,
} from "../lib/competition/risk-events.ts";
import type { TraderPerformance } from "../lib/competition/types.ts";

test("risk event catalog has 8 event types", () => {
  const ids = Object.keys(RISK_EVENT_CATALOG);
  assert.equal(ids.length, 8);
});

test("scenario generation is deterministic for the same cohort", () => {
  const first = generateRiskScenario("test-cohort-1");
  const second = generateRiskScenario("test-cohort-1");

  assert.equal(first.id, second.id);
  assert.equal(first.label, second.label);
  assert.equal(first.events.length, second.events.length);
  assert.equal(first.difficulty, second.difficulty);
});

test("scenario generates different results for different cohorts", () => {
  const scenarioA = generateRiskScenario("cohort-A");
  const scenarioB = generateRiskScenario("cohort-B");

  // Different cohorts produce distinct scenarios
  assert.ok(
    scenarioA.label !== scenarioB.label || scenarioA.events.length !== scenarioB.events.length,
    "Different cohort IDs should tend to produce different scenarios"
  );
});

test("scenario has 2-3 events", () => {
  for (let i = 0; i < 10; i++) {
    const scenario = generateRiskScenario(`test-scenario-${i}`);
    assert.ok(scenario.events.length >= 2, `Scenario ${i} has ${scenario.events.length} events, expected >= 2`);
    assert.ok(scenario.events.length <= 3, `Scenario ${i} has ${scenario.events.length} events, expected <= 3`);
  }
});

test("modifier application adjusts performance metrics", () => {
  const base: TraderPerformance = {
    pnlPercent: 15.0,
    volumeUsd: 200000,
    winRate: 60,
    consistencyScore: 85,
    maxDrawdownPercent: 4.0,
    attainedAt: "2026-03-20T00:00:00.000Z",
  };

  const events = [
    {
      ...RISK_EVENT_CATALOG.flash_crash,
      triggeredAt: new Date().toISOString(),
    },
  ];

  const modified = applyRiskEventModifiers(base, events);
  // Flash crash has modifier -0.35 on pnlPercent
  assert.ok(
    modified.pnlPercent < base.pnlPercent,
    `PnL should decrease: ${modified.pnlPercent} vs ${base.pnlPercent}`
  );
});

test("active event filtering respects time window", () => {
  const now = Date.now();
  const scenario = generateRiskScenario("filter-test");

  // Override triggered times for predictable filtering
  scenario.events[0].triggeredAt = new Date(now - 1000).toISOString();
  scenario.events[0].durationHours = 2;

  if (scenario.events[1]) {
    scenario.events[1].triggeredAt = new Date(now + 10 * 3600000).toISOString();
    scenario.events[1].durationHours = 1;
  }

  const active = getActiveRiskEvents(scenario, now);
  assert.ok(active.length >= 1, "At least one event should be active");
  assert.equal(active[0].id, scenario.events[0].id);
});

test("challenge modifiers stack from multiple events", () => {
  const events = [
    {
      ...RISK_EVENT_CATALOG.flash_crash,
      triggeredAt: new Date().toISOString(),
    },
    {
      ...RISK_EVENT_CATALOG.volatility_spike,
      triggeredAt: new Date().toISOString(),
    },
  ];

  const modifiers = getChallengeModifiers("apex", events);
  // Both events affect apex tier
  assert.ok(
    modifiers.length >= 2,
    `Expected 2+ modifiers for apex, got ${modifiers.length}`
  );
});

test("challenge modifiers filter by tier", () => {
  const events = [
    {
      ...RISK_EVENT_CATALOG.forced_market,
      triggeredAt: new Date().toISOString(),
    },
  ];

  // forced_market only affects elite and apex
  const scoutModifiers = getChallengeModifiers("scout", events);
  assert.equal(scoutModifiers.length, 0, "Scout should not be affected by forced_market");

  const apexModifiers = getChallengeModifiers("apex", events);
  assert.equal(apexModifiers.length, 1, "Apex should be affected by forced_market");
});
