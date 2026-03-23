/**
 * Tests for the wash-trade duration filter in metrics computation.
 * Positions held < MIN_HOLD_SECONDS are excluded from scoring to prevent
 * volume inflation via rapid open/close cycling.
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  computeMetricsFromPositions,
  computeMetricsFromTradeEvents,
  MIN_HOLD_SECONDS,
} from "../lib/adrena/metrics.ts";
import type { AdrenaPosition } from "../lib/adrena/client.ts";

const windowStart = new Date("2026-03-19T00:00:00Z");
const windowEnd = new Date("2026-03-22T00:00:00Z");

function makePosition(
  overrides: Partial<AdrenaPosition> & {
    entry_date: string;
    exit_date: string;
    pnl: number;
  }
): AdrenaPosition {
  return {
    pubkey: "test-pos",
    owner: "test-wallet",
    custody: "test-custody",
    side: "long",
    status: "close",
    entry_price: 100,
    entry_size: 1000,
    collateral_amount: 100,
    current_price: 110,
    pnl: overrides.pnl,
    entry_date: overrides.entry_date,
    exit_date: overrides.exit_date,
    open_interest: 1000,
    leverage: 10,
    token_symbol: "SOL",
    liquidation_price: 90,
    ...overrides,
  } as AdrenaPosition;
}

test("MIN_HOLD_SECONDS is exported and set to 60", () => {
  assert.equal(MIN_HOLD_SECONDS, 60);
});

test("positions held longer than MIN_HOLD_SECONDS are included", () => {
  const positions = [
    makePosition({
      entry_date: "2026-03-19T10:00:00Z",
      exit_date: "2026-03-19T10:05:00Z", // 5 minutes = 300 seconds > 120
      pnl: 10,
    }),
  ];
  const metrics = computeMetricsFromPositions(
    positions,
    windowStart,
    windowEnd
  );
  assert.equal(metrics.tradeCount, 1);
});

test("positions held less than MIN_HOLD_SECONDS are excluded (wash trade)", () => {
  const positions = [
    makePosition({
      entry_date: "2026-03-19T10:00:00Z",
      exit_date: "2026-03-19T10:00:45Z", // 45 seconds < 60
      pnl: 50,
      entry_size: 100_000, // large volume that would inflate scoring
    }),
  ];
  const metrics = computeMetricsFromPositions(
    positions,
    windowStart,
    windowEnd
  );
  assert.equal(metrics.tradeCount, 0, "Wash trade should be filtered out");
  assert.equal(metrics.volumeUsd, 0);
});

test("mix of valid and wash trades: only valid counted", () => {
  const positions = [
    makePosition({
      entry_date: "2026-03-19T10:00:00Z",
      exit_date: "2026-03-19T10:00:30Z", // 30s — wash
      pnl: 100,
      entry_size: 500_000,
    }),
    makePosition({
      entry_date: "2026-03-19T11:00:00Z",
      exit_date: "2026-03-19T14:00:00Z", // 3 hours — valid
      pnl: 20,
      entry_size: 1000,
    }),
  ];
  const metrics = computeMetricsFromPositions(
    positions,
    windowStart,
    windowEnd
  );
  assert.equal(metrics.tradeCount, 1, "Only the valid trade should count");
});

test("position at exact MIN_HOLD_SECONDS boundary is excluded", () => {
  // Exactly 59 seconds — just below threshold
  const positions = [
    makePosition({
      entry_date: "2026-03-19T10:00:00Z",
      exit_date: "2026-03-19T10:00:59Z", // 59 seconds
      pnl: 10,
    }),
  ];
  const metrics = computeMetricsFromPositions(
    positions,
    windowStart,
    windowEnd
  );
  assert.equal(metrics.tradeCount, 0, "Position at 59s should be excluded");
});

test("position at exactly 60 seconds is included", () => {
  const positions = [
    makePosition({
      entry_date: "2026-03-19T10:00:00Z",
      exit_date: "2026-03-19T10:01:00Z", // exactly 60 seconds
      pnl: 10,
    }),
  ];
  const metrics = computeMetricsFromPositions(
    positions,
    windowStart,
    windowEnd
  );
  assert.equal(
    metrics.tradeCount,
    1,
    "Position at exactly 60s should be included"
  );
});

// ── Trade event wash trade filter ───────────────────────────────────────────

test("trade events: wash trades filtered when openedAt provided", () => {
  const events = [
    {
      wallet: "test",
      sizeUsd: 100_000,
      collateralUsd: 1000,
      profitUsd: 50,
      lossUsd: 0,
      netPnl: 50,
      closedAt: new Date("2026-03-19T10:00:30Z"),
      openedAt: new Date("2026-03-19T10:00:00Z"), // 30 seconds — wash
    },
  ];
  const metrics = computeMetricsFromTradeEvents(events, windowStart, windowEnd);
  assert.equal(metrics.tradeCount, 0, "Wash trade event should be filtered");
});

test("trade events: events without openedAt are included (backwards compat)", () => {
  const events = [
    {
      wallet: "test",
      sizeUsd: 1000,
      collateralUsd: 100,
      profitUsd: 10,
      lossUsd: 0,
      netPnl: 10,
      closedAt: new Date("2026-03-19T10:01:00Z"),
      // no openedAt — legacy
    },
  ];
  const metrics = computeMetricsFromTradeEvents(events, windowStart, windowEnd);
  assert.equal(
    metrics.tradeCount,
    1,
    "Events without openedAt should pass through"
  );
});
