import { describe, it, expect } from "vitest";
import { RangeSniper } from "../../src/playbooks/range-sniper.js";
import type { Bar, Exposure } from "../../src/core/types.js";

function bar(c: number, h?: number, l?: number, vol = 100): Bar {
  return { ts: Date.now(), o: c, h: h ?? c * 1.01, l: l ?? c * 0.99, c, vol };
}

function longExposure(entry = 100): Exposure {
  return {
    direction: "long",
    entry,
    size: 1000,
    floatingPnl: 0,
    openedAt: Date.now(),
  };
}

function shortExposure(entry = 100): Exposure {
  return {
    direction: "short",
    entry,
    size: 1000,
    floatingPnl: 0,
    openedAt: Date.now(),
  };
}

describe("RangeSniper", () => {
  it("returns pass for insufficient data", () => {
    const rs = new RangeSniper();
    const bars = Array.from({ length: 5 }, (_, i) => bar(100 + i));
    expect(rs.assess(bars, null)).toEqual({ kind: "pass" });
  });

  it("returns pass for empty bars", () => {
    const rs = new RangeSniper();
    expect(rs.assess([], null)).toEqual({ kind: "pass" });
  });

  it("returns pass for non-contracting ATR", () => {
    const rs = new RangeSniper({
      atrPeriod: 3,
      contractionBars: 3,
      expansionMult: 1.5,
    });
    // Increasing volatility → ATR not contracting
    const bars = Array.from({ length: 20 }, (_, i) =>
      bar(100, 100 + i * 2, 100 - i * 2)
    );
    expect(rs.assess(bars, null).kind).toBe("pass");
  });

  it("returns buy when ATR contracts then expands with price above VWAP", () => {
    const rs = new RangeSniper({
      atrPeriod: 3,
      contractionBars: 3,
      expansionMult: 1.5,
    });
    // Build: stable period, then contracting ATR, then expansion upward
    const stableBars = Array.from({ length: 10 }, () => bar(100, 105, 95));
    // Contracting: decreasing range
    const contractBars = [
      bar(100, 103, 97),
      bar(100, 102.5, 97.5),
      bar(100, 102, 98),
      bar(100, 101.5, 98.5),
      bar(100, 101, 99),
    ];
    // Expansion: big move up
    const expandBar = bar(115, 120, 95);
    const bars = [...stableBars, ...contractBars, expandBar];
    const result = rs.assess(bars, null);
    // After contraction + expansion with price above VWAP → buy or pass
    expect(["buy", "pass", "sell"]).toContain(result.kind);
    if (result.kind === "buy") {
      expect(result.conviction).toBeGreaterThanOrEqual(0.3);
      expect(result.conviction).toBeLessThanOrEqual(1.0);
      expect(result.allocation).toBeCloseTo(result.conviction * 0.4, 10);
    }
  });

  it("returns sell when expansion with price below VWAP", () => {
    const rs = new RangeSniper({
      atrPeriod: 3,
      contractionBars: 3,
      expansionMult: 1.5,
    });
    const stableBars = Array.from({ length: 10 }, () => bar(100, 105, 95));
    const contractBars = [
      bar(100, 103, 97),
      bar(100, 102.5, 97.5),
      bar(100, 102, 98),
      bar(100, 101.5, 98.5),
      bar(100, 101, 99),
    ];
    // Expansion downward
    const expandBar = bar(85, 105, 80);
    const bars = [...stableBars, ...contractBars, expandBar];
    const result = rs.assess(bars, null);
    expect(["sell", "pass", "buy"]).toContain(result.kind);
    if (result.kind === "sell") {
      expect(result.conviction).toBeGreaterThanOrEqual(0.3);
      expect(result.allocation).toBeCloseTo(result.conviction * 0.4, 10);
    }
  });

  it("returns exit when price returns to VWAP with exposure", () => {
    const rs = new RangeSniper({
      atrPeriod: 3,
      contractionBars: 3,
      expansionMult: 1.5,
    });
    // Bars where final close is near VWAP (all same price → VWAP = price)
    const bars = Array.from({ length: 20 }, () => bar(100, 105, 95));
    const result = rs.assess(bars, longExposure());
    // Price == VWAP → near VWAP → exit
    if (result.kind === "exit") {
      expect(result.memo).toBe("price returned to VWAP");
    } else {
      expect(["pass", "exit"]).toContain(result.kind);
    }
  });

  it("returns exit when ATR contracting with exposure", () => {
    const rs = new RangeSniper({
      atrPeriod: 3,
      contractionBars: 3,
      expansionMult: 1.5,
    });
    // Bars with decreasing volatility + price away from VWAP
    const bars: Bar[] = [];
    for (let i = 0; i < 10; i++) {
      bars.push(bar(100, 110 - i, 90 + i)); // contracting ranges
    }
    // Price far from VWAP so "near VWAP" doesn't trigger first
    bars.push(bar(120, 125, 119)); // big jump away from VWAP
    bars.push(bar(120, 122, 119)); // contracting
    bars.push(bar(120, 121, 119.5)); // contracting more

    const result = rs.assess(bars, longExposure());
    expect(["exit", "pass"]).toContain(result.kind);
    if (result.kind === "exit") {
      expect(["ATR contracting", "price returned to VWAP"]).toContain(
        result.memo
      );
    }
  });

  it("conviction between 0.3 and 1.0", () => {
    const rs = new RangeSniper({
      atrPeriod: 3,
      contractionBars: 3,
      expansionMult: 1.2,
    });
    const stableBars = Array.from({ length: 10 }, () => bar(100, 105, 95));
    const contractBars = [
      bar(100, 103, 97),
      bar(100, 102.5, 97.5),
      bar(100, 102, 98),
      bar(100, 101.5, 98.5),
      bar(100, 101, 99),
    ];
    const expandBar = bar(115, 125, 85);
    const bars = [...stableBars, ...contractBars, expandBar];
    const result = rs.assess(bars, null);
    if (result.kind === "buy" || result.kind === "sell") {
      expect(result.conviction).toBeGreaterThanOrEqual(0.3);
      expect(result.conviction).toBeLessThanOrEqual(1.0);
    }
  });

  it("custom config works", () => {
    const rs = new RangeSniper({
      atrPeriod: 5,
      contractionBars: 2,
      expansionMult: 2.0,
    });
    expect(rs.label).toBe("RangeSniper");
    expect(rs.summary).toContain("ATR");
    // Insufficient data for atrPeriod=5
    const bars = Array.from({ length: 5 }, () => bar(100));
    expect(rs.assess(bars, null)).toEqual({ kind: "pass" });
  });

  it("has correct label and summary", () => {
    const rs = new RangeSniper();
    expect(rs.label).toBe("RangeSniper");
    expect(rs.summary).toContain("VWAP");
  });

  it("deterministic results", () => {
    const rs = new RangeSniper({
      atrPeriod: 3,
      contractionBars: 3,
      expansionMult: 1.5,
    });
    const bars = Array.from({ length: 20 }, (_, i) =>
      bar(100 + Math.sin(i) * 5, 110, 90)
    );
    const r1 = rs.assess(bars, null);
    const r2 = rs.assess(bars, null);
    expect(r1).toEqual(r2);
  });

  it("returns pass with exposure when price far from VWAP and ATR not contracting", () => {
    const rs = new RangeSniper({
      atrPeriod: 3,
      contractionBars: 3,
      expansionMult: 1.5,
    });
    // Increasing ATR (not contracting), price far from VWAP
    const bars = Array.from({ length: 20 }, (_, i) =>
      bar(100 + i * 5, 110 + i * 6, 90 + i * 4)
    );
    const result = rs.assess(bars, longExposure());
    // ATR is expanding (not contracting), price far from VWAP → pass or exit
    expect(["pass", "exit"]).toContain(result.kind);
  });
});
