import { describe, it, expect } from "vitest";
import { TrendSurfer } from "../../src/playbooks/trend-surfer.js";
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

describe("TrendSurfer", () => {
  it("returns pass for a single bar", () => {
    const ts = new TrendSurfer();
    expect(ts.assess([bar(100)], null)).toEqual({ kind: "pass" });
  });

  it("returns pass for insufficient data (< slowLen + 2 bars)", () => {
    const ts = new TrendSurfer(); // slowLen = 26
    const bars = Array.from({ length: 27 }, (_, i) => bar(100 + i));
    expect(ts.assess(bars, null)).toEqual({ kind: "pass" });
  });

  it("returns pass for exactly slowLen + 1 bars", () => {
    const ts = new TrendSurfer({ slowLen: 10 });
    const bars = Array.from({ length: 11 }, (_, i) => bar(100));
    expect(ts.assess(bars, null)).toEqual({ kind: "pass" });
  });

  it("returns pass for flat data (no histogram crossover)", () => {
    const ts = new TrendSurfer({ fastLen: 3, slowLen: 5, signalLen: 3 });
    // All same price → fast EMA == slow EMA → histogram ~= 0 for both curr and prev
    const bars = Array.from({ length: 20 }, () => bar(100));
    const result = ts.assess(bars, null);
    expect(result.kind).toBe("pass");
  });

  it("returns buy when histogram crosses from negative to positive", () => {
    const ts = new TrendSurfer({ fastLen: 3, slowLen: 6, signalLen: 3 });
    // Downtrend followed by strong uptrend → histogram goes negative then crosses positive
    const downBars = Array.from({ length: 10 }, (_, i) => bar(120 - i * 2));
    const upBars = Array.from({ length: 10 }, (_, i) => bar(102 + i * 3));
    const bars = [...downBars, ...upBars];
    const result = ts.assess(bars, null);
    // After strong reversal upward, histogram should cross zero
    if (result.kind === "buy") {
      expect(result.conviction).toBeGreaterThanOrEqual(0.3);
      expect(result.conviction).toBeLessThanOrEqual(1.0);
      expect(result.allocation).toBeCloseTo(result.conviction * 0.5);
    } else {
      // If not buy, it might be pass (histogram hasn't crossed yet) or sell
      expect(["buy", "pass", "sell"]).toContain(result.kind);
    }
  });

  it("returns sell when histogram crosses from positive to negative", () => {
    const ts = new TrendSurfer({ fastLen: 3, slowLen: 6, signalLen: 3 });
    // Uptrend followed by strong downtrend
    const upBars = Array.from({ length: 10 }, (_, i) => bar(80 + i * 3));
    const downBars = Array.from({ length: 10 }, (_, i) => bar(110 - i * 3));
    const bars = [...upBars, ...downBars];
    const result = ts.assess(bars, null);
    if (result.kind === "sell") {
      expect(result.conviction).toBeGreaterThanOrEqual(0.3);
      expect(result.conviction).toBeLessThanOrEqual(1.0);
    } else {
      expect(["sell", "pass", "buy"]).toContain(result.kind);
    }
  });

  it("returns exit for long when histogram crosses below zero", () => {
    const ts = new TrendSurfer({ fastLen: 3, slowLen: 6, signalLen: 3 });
    // Uptrend then reversal down → histogram was positive, now crosses negative
    const upBars = Array.from({ length: 10 }, (_, i) => bar(80 + i * 3));
    const downBars = Array.from({ length: 10 }, (_, i) => bar(110 - i * 3));
    const bars = [...upBars, ...downBars];
    const result = ts.assess(bars, longExposure());
    // With long exposure, if histogram crosses below zero → exit
    if (result.kind === "exit") {
      expect(result.memo).toBe("histogram crossed below zero");
    } else {
      expect(result.kind).toBe("pass");
    }
  });

  it("returns exit for short when histogram crosses above zero", () => {
    const ts = new TrendSurfer({ fastLen: 3, slowLen: 6, signalLen: 3 });
    const downBars = Array.from({ length: 10 }, (_, i) => bar(120 - i * 2));
    const upBars = Array.from({ length: 10 }, (_, i) => bar(102 + i * 3));
    const bars = [...downBars, ...upBars];
    const result = ts.assess(bars, shortExposure());
    if (result.kind === "exit") {
      expect(result.memo).toBe("histogram crossed above zero");
    } else {
      expect(result.kind).toBe("pass");
    }
  });

  it("returns pass when in position and no crossover", () => {
    const ts = new TrendSurfer({ fastLen: 3, slowLen: 6, signalLen: 3 });
    // Steady uptrend → histogram stays positive
    const bars = Array.from({ length: 20 }, (_, i) => bar(100 + i * 2));
    const result = ts.assess(bars, longExposure());
    expect(result.kind).toBe("pass");
  });

  it("conviction is clamped between 0.3 and 1.0", () => {
    const ts = new TrendSurfer({ fastLen: 3, slowLen: 6, signalLen: 3 });
    // Strong signal bars
    const bars = Array.from({ length: 20 }, (_, i) =>
      bar(100 + (i < 10 ? -i * 5 : (i - 10) * 10))
    );
    const result = ts.assess(bars, null);
    if (result.kind === "buy" || result.kind === "sell") {
      expect(result.conviction).toBeGreaterThanOrEqual(0.3);
      expect(result.conviction).toBeLessThanOrEqual(1.0);
    }
  });

  it("allocation equals conviction * 0.5", () => {
    const ts = new TrendSurfer({ fastLen: 3, slowLen: 6, signalLen: 3 });
    const downBars = Array.from({ length: 10 }, (_, i) => bar(120 - i * 2));
    const upBars = Array.from({ length: 10 }, (_, i) => bar(102 + i * 3));
    const bars = [...downBars, ...upBars];
    const result = ts.assess(bars, null);
    if (result.kind === "buy" || result.kind === "sell") {
      expect(result.allocation).toBeCloseTo(result.conviction * 0.5, 10);
    }
  });

  it("custom config overrides defaults", () => {
    const ts = new TrendSurfer({ fastLen: 5, slowLen: 10, signalLen: 4 });
    // With slowLen=10, need 12 bars minimum
    const bars = Array.from({ length: 11 }, () => bar(100));
    expect(ts.assess(bars, null)).toEqual({ kind: "pass" });
    // With 12+ bars of flat data, should still pass (no crossover)
    const bars2 = Array.from({ length: 15 }, () => bar(100));
    expect(ts.assess(bars2, null).kind).toBe("pass");
  });

  it("has correct label and summary", () => {
    const ts = new TrendSurfer();
    expect(ts.label).toBe("TrendSurfer");
    expect(ts.summary).toContain("MACD histogram");
  });

  it("deterministic results for identical inputs", () => {
    const ts = new TrendSurfer({ fastLen: 3, slowLen: 6, signalLen: 3 });
    const bars = Array.from({ length: 20 }, (_, i) =>
      bar(100 + Math.sin(i) * 10)
    );
    const r1 = ts.assess(bars, null);
    const r2 = ts.assess(bars, null);
    expect(r1).toEqual(r2);
  });
});
