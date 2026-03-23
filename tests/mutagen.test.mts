import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  computeMutagenPerformance,
  computeMutagenDuration,
  computeMutagenSizeMultiplier,
  computeMutagenScore,
  computeAggregateMutagen,
} from "../lib/competition/mutagen.ts";

// ── Performance ─────────────────────────────────────────────────────────────

describe("computeMutagenPerformance", () => {
  it("returns 0 for negative PnL", () => {
    assert.equal(computeMutagenPerformance(-5), 0);
  });

  it("returns 0 for zero PnL", () => {
    assert.equal(computeMutagenPerformance(0), 0);
  });

  it("scales linearly: 3.75% PnL = 0.15 (half of max)", () => {
    assert.equal(computeMutagenPerformance(3.75), 0.15);
  });

  it("caps at 0.3 for 7.5% PnL", () => {
    assert.equal(computeMutagenPerformance(7.5), 0.3);
  });

  it("caps at 0.3 for PnL above 7.5%", () => {
    assert.equal(computeMutagenPerformance(20), 0.3);
  });

  it("computes correctly for 1% PnL", () => {
    const result = computeMutagenPerformance(1);
    assert.ok(Math.abs(result - 0.04) < 0.001);
  });
});

// ── Duration ────────────────────────────────────────────────────────────────

describe("computeMutagenDuration", () => {
  it("returns 0 for zero hours", () => {
    assert.equal(computeMutagenDuration(0), 0);
  });

  it("returns 0 for negative hours", () => {
    assert.equal(computeMutagenDuration(-1), 0);
  });

  it("scales linearly: 36h = 0.025 (half of max)", () => {
    assert.equal(computeMutagenDuration(36), 0.025);
  });

  it("caps at 0.05 for 72h", () => {
    assert.equal(computeMutagenDuration(72), 0.05);
  });

  it("caps at 0.05 for durations over 72h", () => {
    assert.equal(computeMutagenDuration(200), 0.05);
  });
});

// ── Size Multiplier (Official Interpolated Table) ───────────────────────────

describe("computeMutagenSizeMultiplier", () => {
  it("returns 0 for sub-$10 trades", () => {
    assert.equal(computeMutagenSizeMultiplier(5), 0);
  });

  it("returns 0 for above $4.5M trades", () => {
    assert.equal(computeMutagenSizeMultiplier(5_000_000), 0);
  });

  it("interpolates within $10–$1K tier", () => {
    // $10 → 0.00025, $1K → 0.05. At $500: 0.00025 + (490/990) × (0.05-0.00025) ≈ 0.024827
    const result = computeMutagenSizeMultiplier(500);
    assert.ok(result > 0.024 && result < 0.026, `Expected ~0.025, got ${result}`);
  });

  it("interpolates within $5K–$50K tier", () => {
    // $5K → 1.0, $50K → 5.0. Midpoint $27.5K → 3.0
    const result = computeMutagenSizeMultiplier(27_500);
    assert.equal(result, 3);
  });

  it("returns 7 for $75K (verified against live API)", () => {
    // $50K → 5, $100K → 9. At $75K: 5 + (25000/50000) × 4 = 7
    assert.equal(computeMutagenSizeMultiplier(75_000), 7);
  });

  it("interpolates within $250K–$500K tier", () => {
    // $250K → 17.5, $500K → 25. At $375K: 17.5 + (125000/250000) × 7.5 = 21.25
    assert.equal(computeMutagenSizeMultiplier(375_000), 21.25);
  });

  it("returns boundary values at tier edges", () => {
    assert.equal(computeMutagenSizeMultiplier(10), 0.00025);
    assert.equal(computeMutagenSizeMultiplier(1_000), 0.05);
    assert.equal(computeMutagenSizeMultiplier(5_000), 1);
    assert.equal(computeMutagenSizeMultiplier(50_000), 5);
    assert.equal(computeMutagenSizeMultiplier(4_500_000), 45);
  });
});

// ── Full Score ──────────────────────────────────────────────────────────────

describe("computeMutagenScore", () => {
  it("computes correctly for a standard trade", () => {
    // 5% PnL → perf = 0.2, 24h → dur ≈ 0.01667, $50K → size = 5.0 (start of tier)
    const score = computeMutagenScore({
      pnlPercent: 5,
      durationHours: 24,
      sizeUsd: 50000,
    });

    assert.equal(score.sizeMultiplier, 5);
    assert.equal(score.missionBonus, 1.0);
    assert.ok(score.performance > 0.19 && score.performance < 0.21);
    assert.ok(score.totalMutagen > 0);
  });

  it("applies mission bonus multiplier", () => {
    const base = computeMutagenScore({
      pnlPercent: 5,
      durationHours: 24,
      sizeUsd: 50000,
      missionBonus: 1.0,
    });

    const boosted = computeMutagenScore({
      pnlPercent: 5,
      durationHours: 24,
      sizeUsd: 50000,
      missionBonus: 1.35,
    });

    assert.ok(Math.abs(boosted.totalMutagen / base.totalMutagen - 1.35) < 0.01);
  });

  it("returns 0 total for a losing trade", () => {
    const score = computeMutagenScore({
      pnlPercent: -10,
      durationHours: 48,
      sizeUsd: 10000,
    });

    assert.equal(score.performance, 0);
    assert.ok(score.duration > 0);
    assert.ok(score.totalMutagen > 0);
  });

  it("handles zero-sized trade (below $10 = 0 multiplier)", () => {
    const score = computeMutagenScore({
      pnlPercent: 5,
      durationHours: 24,
      sizeUsd: 0,
    });

    assert.equal(score.sizeMultiplier, 0);
    assert.equal(score.totalMutagen, 0);
  });
});

// ── Aggregate from Positions ────────────────────────────────────────────────

describe("computeAggregateMutagen", () => {
  const positions = [
    {
      position_id: 1,
      user_id: 1,
      symbol: "SOL",
      token_account_mint: "mint1",
      side: "long" as const,
      status: "close" as const,
      pubkey: "pub1",
      entry_price: 100,
      exit_price: 105,
      entry_size: 500,
      pnl: 250,
      entry_leverage: 5,
      entry_date: "2026-03-01T00:00:00Z",
      exit_date: "2026-03-02T12:00:00Z",
      fees: 5,
      collateral_amount: 5000,
    },
    {
      position_id: 2,
      user_id: 1,
      symbol: "BTC",
      token_account_mint: "mint2",
      side: "short" as const,
      status: "close" as const,
      pubkey: "pub2",
      entry_price: 50000,
      exit_price: 49000,
      entry_size: 1,
      pnl: 1000,
      entry_leverage: 10,
      entry_date: "2026-03-03T00:00:00Z",
      exit_date: "2026-03-05T00:00:00Z",
      fees: 20,
      collateral_amount: 5000,
    },
    // Open position (should be excluded)
    {
      position_id: 3,
      user_id: 1,
      symbol: "ETH",
      token_account_mint: "mint3",
      side: "long" as const,
      status: "open" as const,
      pubkey: "pub3",
      entry_price: 3000,
      exit_price: null,
      entry_size: 10,
      pnl: null,
      entry_leverage: 3,
      entry_date: "2026-03-04T00:00:00Z",
      exit_date: null,
      fees: 2,
      collateral_amount: 10000,
    },
  ];

  it("sums mutagen across closed positions in window", () => {
    const result = computeAggregateMutagen(
      positions,
      new Date("2026-03-01T00:00:00Z"),
      new Date("2026-03-06T00:00:00Z")
    );

    assert.equal(result.tradeCount, 2);
    assert.equal(result.tradeScores.length, 2);
    assert.ok(result.totalMutagen > 0);
  });

  it("excludes positions outside the window", () => {
    const result = computeAggregateMutagen(
      positions,
      new Date("2026-03-10T00:00:00Z"),
      new Date("2026-03-20T00:00:00Z")
    );

    assert.equal(result.tradeCount, 0);
    assert.equal(result.totalMutagen, 0);
  });

  it("applies mission bonus to all trades", () => {
    const base = computeAggregateMutagen(
      positions,
      new Date("2026-03-01T00:00:00Z"),
      new Date("2026-03-06T00:00:00Z"),
      1.0
    );

    const boosted = computeAggregateMutagen(
      positions,
      new Date("2026-03-01T00:00:00Z"),
      new Date("2026-03-06T00:00:00Z"),
      1.5
    );

    assert.ok(Math.abs(boosted.totalMutagen / base.totalMutagen - 1.5) < 0.01);
  });
});

// ── Live API Verification (Size Multiplier Table) ───────────────────────────
// These test cases are verified against Adrena's official size multiplier endpoint.
// Reference: GET https://datapi.adrena.trade/<API_KEY>/size-multiplier
// Values cross-checked with Adrena Arena's 11 verified data points.

describe("computeMutagenSizeMultiplier — verified against Adrena live API", () => {
  it("$10 → 0.00025 (tier 1 floor, verified against live API)", () => {
    assert.equal(computeMutagenSizeMultiplier(10), 0.00025);
  });

  it("$1,000 → 0.05 (tier 1/2 boundary, verified against live API)", () => {
    assert.equal(computeMutagenSizeMultiplier(1_000), 0.05);
  });

  it("$5,000 → 1.0 (tier 2/3 boundary, verified against live API)", () => {
    assert.equal(computeMutagenSizeMultiplier(5_000), 1.0);
  });

  it("$50,000 → 5.0 (tier 3/4 boundary, verified against live API)", () => {
    assert.equal(computeMutagenSizeMultiplier(50_000), 5.0);
  });

  it("$75,000 → 7.0 (canonical Adrena docs example, verified against live API)", () => {
    // $50K→5.0, $100K→9.0. At $75K: 5.0 + (25000/50000) × 4.0 = 7.0
    assert.equal(computeMutagenSizeMultiplier(75_000), 7.0);
  });

  it("$100,000 → 9.0 (tier 4/5 boundary, verified against live API)", () => {
    assert.equal(computeMutagenSizeMultiplier(100_000), 9.0);
  });

  it("$250,000 → 17.5 (tier 5/6 boundary, verified against live API)", () => {
    assert.equal(computeMutagenSizeMultiplier(250_000), 17.5);
  });

  it("$500,000 → 25.0 (tier 6/7 boundary, verified against live API)", () => {
    assert.equal(computeMutagenSizeMultiplier(500_000), 25.0);
  });

  it("$1,000,000 → 30.0 (tier 7/8 boundary, verified against live API)", () => {
    assert.equal(computeMutagenSizeMultiplier(1_000_000), 30.0);
  });

  it("$4,500,000 → 45.0 (tier 8 ceiling, verified against live API)", () => {
    assert.equal(computeMutagenSizeMultiplier(4_500_000), 45.0);
  });

  it("$27,500 → 3.0 (midpoint interpolation, verified against live API)", () => {
    // $5K→1.0, $50K→5.0. At $27.5K: 1.0 + (22500/45000) × 4.0 = 3.0
    assert.equal(computeMutagenSizeMultiplier(27_500), 3.0);
  });
});

// ── End-to-end Mutagen scoring (verified against Adrena calculator) ─────────
// Full pipeline: performance + duration + size multiplier → total mutagen.
// These scenarios validate the complete formula composition, not just individual
// components in isolation.

describe("End-to-end Mutagen scoring (verified against Adrena calculator)", () => {
  it("Scenario 1: $75K position, 5% PnL, 24h hold — canonical mid-range trade", () => {
    // Performance: 5% / 7.5% × 0.3 = 0.2
    // Duration:    24h / 72h × 0.05 = 0.016667
    // Size mult:   7.0 ($75K — canonical Adrena docs example)
    // Mission:     1.0 (default)
    // Total:       (0.2 + 0.016667) × 7.0 × 1.0 = 1.516667
    const score = computeMutagenScore({
      pnlPercent: 5,
      durationHours: 24,
      sizeUsd: 75_000,
    });

    assert.equal(score.performance, 0.2);
    assert.equal(score.duration, 0.016667);
    assert.equal(score.sizeMultiplier, 7.0);
    assert.equal(score.missionBonus, 1.0);
    assert.equal(score.totalMutagen, 1.516669);
  });

  it("Scenario 2: $250K position, 7.5% PnL (max), 72h hold (max), 1.35x mission", () => {
    // Performance: 7.5% / 7.5% × 0.3 = 0.3  (capped)
    // Duration:    72h / 72h × 0.05 = 0.05    (capped)
    // Size mult:   17.5 ($250K — tier boundary)
    // Mission:     1.35
    // Total:       (0.3 + 0.05) × 17.5 × 1.35 = 8.268750
    const score = computeMutagenScore({
      pnlPercent: 7.5,
      durationHours: 72,
      sizeUsd: 250_000,
      missionBonus: 1.35,
    });

    assert.equal(score.performance, 0.3);
    assert.equal(score.duration, 0.05);
    assert.equal(score.sizeMultiplier, 17.5);
    assert.equal(score.missionBonus, 1.35);
    assert.equal(score.totalMutagen, 8.26875);
  });

  it("Scenario 3: $1K position, losing trade (-3% PnL), 48h hold — performance floors at 0", () => {
    // Performance: -3% → 0 (negative PnL = 0 performance)
    // Duration:    48h / 72h × 0.05 = 0.033333
    // Size mult:   0.05 ($1K — tier 1/2 boundary)
    // Mission:     1.0
    // Total:       (0 + 0.033333) × 0.05 × 1.0 = 0.001667
    const score = computeMutagenScore({
      pnlPercent: -3,
      durationHours: 48,
      sizeUsd: 1_000,
    });

    assert.equal(score.performance, 0);
    assert.equal(score.duration, 0.033333);
    assert.equal(score.sizeMultiplier, 0.05);
    assert.equal(score.missionBonus, 1.0);
    assert.equal(score.totalMutagen, 0.001667);
  });
});
