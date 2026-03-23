import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { parseUsd } from "../lib/adrena/parse-usd.ts";
import {
  computeMetricsFromTradeEvents,
  type TradeEventRow,
} from "../lib/adrena/metrics.ts";
import { getMarketInfo, isCustodyAllowed } from "../lib/adrena/custody-map.ts";
import { computeAggregateMutagenFromEvents } from "../lib/competition/mutagen.ts";

// ── parseUsd ────────────────────────────────────────────────────────────────

describe("parseUsd", () => {
  it("parses standard dollar string", () => {
    assert.equal(parseUsd("$164.535338"), 164.535338);
  });

  it("parses zero", () => {
    assert.equal(parseUsd("$0.00"), 0);
  });

  it("parses comma-separated amounts", () => {
    assert.equal(parseUsd("$1,234.56"), 1234.56);
  });

  it("parses negative amounts", () => {
    assert.equal(parseUsd("-$5.00"), -5);
  });

  it("handles plain number string", () => {
    assert.equal(parseUsd("42.5"), 42.5);
  });

  it("returns 0 for garbage input", () => {
    assert.equal(parseUsd("not-a-number"), 0);
  });

  it("parses large amounts", () => {
    assert.equal(parseUsd("$4,500,000.00"), 4500000);
  });
});

// ── computeMetricsFromTradeEvents ───────────────────────────────────────────

describe("computeMetricsFromTradeEvents", () => {
  const events: TradeEventRow[] = [
    {
      wallet: "wallet1",
      sizeUsd: 10000,
      collateralUsd: 1000,
      profitUsd: 150,
      lossUsd: 0,
      netPnl: 150,
      closedAt: new Date("2026-03-10T12:00:00Z"),
    },
    {
      wallet: "wallet1",
      sizeUsd: 5000,
      collateralUsd: 500,
      profitUsd: 0,
      lossUsd: 50,
      netPnl: -50,
      closedAt: new Date("2026-03-11T14:00:00Z"),
    },
    {
      wallet: "wallet1",
      sizeUsd: 8000,
      collateralUsd: 800,
      profitUsd: 200,
      lossUsd: 0,
      netPnl: 200,
      closedAt: new Date("2026-03-12T09:00:00Z"),
    },
  ];

  const windowStart = new Date("2026-03-09T00:00:00Z");
  const windowEnd = new Date("2026-03-13T00:00:00Z");

  it("computes correct PnL percent", () => {
    const metrics = computeMetricsFromTradeEvents(
      events,
      windowStart,
      windowEnd
    );
    // totalPnl = 150 - 50 + 200 = 300
    // totalCollateral = 1000 + 500 + 800 = 2300
    // pnlPercent = (300 / 2300) × 100 ≈ 13.04
    assert.ok(Math.abs(metrics.pnlPercent - 13.04) < 0.1);
  });

  it("computes correct volume", () => {
    const metrics = computeMetricsFromTradeEvents(
      events,
      windowStart,
      windowEnd
    );
    assert.equal(metrics.volumeUsd, 23000);
  });

  it("computes correct win rate", () => {
    const metrics = computeMetricsFromTradeEvents(
      events,
      windowStart,
      windowEnd
    );
    // 2 wins out of 3 trades = 66.67%
    assert.ok(Math.abs(metrics.winRate - 66.67) < 0.1);
  });

  it("computes correct trade count", () => {
    const metrics = computeMetricsFromTradeEvents(
      events,
      windowStart,
      windowEnd
    );
    assert.equal(metrics.tradeCount, 3);
  });

  it("computes correct active days", () => {
    const metrics = computeMetricsFromTradeEvents(
      events,
      windowStart,
      windowEnd
    );
    assert.equal(metrics.activeDays, 3);
  });

  it("filters by window", () => {
    const narrow = computeMetricsFromTradeEvents(
      events,
      new Date("2026-03-10T00:00:00Z"),
      new Date("2026-03-10T23:59:59Z")
    );
    assert.equal(narrow.tradeCount, 1);
    assert.equal(narrow.volumeUsd, 10000);
  });

  it("returns zeros for empty events", () => {
    const metrics = computeMetricsFromTradeEvents([], windowStart, windowEnd);
    assert.equal(metrics.tradeCount, 0);
    assert.equal(metrics.pnlPercent, 0);
    assert.equal(metrics.volumeUsd, 0);
  });

  it("computes max drawdown", () => {
    const metrics = computeMetricsFromTradeEvents(
      events,
      windowStart,
      windowEnd
    );
    // Equity curve: 0 → 150 → 100 → 300
    // Drawdown from HWM 150 to 100 = 50/150 ≈ 33.33%
    assert.ok(metrics.maxDrawdownPercent > 0);
  });
});

// ── custody-map ─────────────────────────────────────────────────────────────

describe("custody-map", () => {
  it("identifies SOL custody", () => {
    const info = getMarketInfo("So11111111111111111111111111111111");
    assert.ok(info);
    assert.equal(info.market, "SOL");
    assert.equal(info.assetClass, "crypto");
  });

  it("identifies BONK custody", () => {
    const info = getMarketInfo("DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263");
    assert.ok(info);
    assert.equal(info.market, "BONK");
    assert.equal(info.assetClass, "crypto");
  });

  it("returns null for unknown custody", () => {
    const info = getMarketInfo("UnknownMint123456789012345678901234567890");
    assert.equal(info, null);
  });

  it("classifies unknown synthetic mint as RWA", () => {
    const info = getMarketInfo("UnknownSyntheticMint12345678901234567890", 1);
    assert.ok(info);
    assert.equal(info.assetClass, "metals");
  });

  it("isCustodyAllowed checks against market list", () => {
    // SOL should be allowed for crypto track
    assert.equal(
      isCustodyAllowed("So11111111111111111111111111111111", [
        "SOL",
        "BTC",
        "ETH",
      ]),
      true
    );
    // SOL should NOT be allowed for metals track
    assert.equal(
      isCustodyAllowed("So11111111111111111111111111111111", ["XAU", "XAG"]),
      false
    );
  });

  it("allows unknown custodies (fail open)", () => {
    assert.equal(
      isCustodyAllowed("TotallyUnknownMint1234567890123456789012", ["XAU"]),
      true
    );
  });
});

// ── computeAggregateMutagenFromEvents ───────────────────────────────────────

describe("computeAggregateMutagenFromEvents", () => {
  const events = [
    {
      sizeUsd: 75_000, // → multiplier 7x
      collateralUsd: 10_000,
      netPnl: 500, // 5% PnL → perf 0.2
      closedAt: new Date("2026-03-10T12:00:00Z"),
    },
    {
      sizeUsd: 10, // → multiplier 0.00025x (bottom of table)
      collateralUsd: 1,
      netPnl: 0.05, // 5% PnL → perf 0.2
      closedAt: new Date("2026-03-11T12:00:00Z"),
    },
  ];

  const windowStart = new Date("2026-03-09T00:00:00Z");
  const windowEnd = new Date("2026-03-13T00:00:00Z");

  it("sums mutagen across trade events in window", () => {
    const result = computeAggregateMutagenFromEvents(
      events,
      windowStart,
      windowEnd
    );
    assert.equal(result.tradeCount, 2);
    assert.ok(result.totalMutagen > 0);
  });

  it("uses official interpolated multiplier", () => {
    const result = computeAggregateMutagenFromEvents(
      events,
      windowStart,
      windowEnd
    );
    // First trade: perf=0.2, dur=0, size=7x → (0.2+0)×7×1 = 1.4
    assert.equal(result.tradeScores[0].sizeMultiplier, 7);
    assert.ok(
      Math.abs(result.tradeScores[0].totalMutagen - 1.4) < 0.01,
      `Expected ~1.4, got ${result.tradeScores[0].totalMutagen}`
    );
  });

  it("excludes events outside window", () => {
    const result = computeAggregateMutagenFromEvents(
      events,
      new Date("2026-04-01T00:00:00Z"),
      new Date("2026-04-30T00:00:00Z")
    );
    assert.equal(result.tradeCount, 0);
    assert.equal(result.totalMutagen, 0);
  });
});

// ── WS message parsing ─────────────────────────────────────────────────────

describe("WS close_position message parsing", () => {
  it("parses a full decoded close_position message", () => {
    const decoded = {
      owner: "97ZYQwalletaddr",
      position: "C2bwDpositionpda",
      custodyMint: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
      side: "Long",
      sizeUsd: "$164.535338",
      price: "$0.0607",
      collateralAmountUsd: "$15.565043",
      profitUsd: "$1.068799",
      lossUsd: "$0.00",
      netPnl: "$1.068799",
      borrowFeeUsd: "$0.000122",
      exitFeeUsd: "$0.297651",
      positionId: "110159",
      percentageClosed: "100.00%",
    };

    assert.equal(parseUsd(decoded.sizeUsd), 164.535338);
    assert.equal(parseUsd(decoded.profitUsd), 1.068799);
    assert.equal(parseUsd(decoded.lossUsd), 0);
    assert.equal(parseUsd(decoded.netPnl), 1.068799);
    assert.equal(parseUsd(decoded.exitFeeUsd), 0.297651);
    assert.equal(decoded.side, "Long");
    assert.equal(decoded.positionId, "110159");

    // The custody mint is a known BONK address
    const info = getMarketInfo(decoded.custodyMint);
    assert.ok(info);
    assert.equal(info.market, "BONK");
  });
});
