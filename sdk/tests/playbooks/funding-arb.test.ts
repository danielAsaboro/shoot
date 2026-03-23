import { describe, it, expect } from "vitest";
import { FundingArb } from "../../src/playbooks/funding-arb.js";
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

describe("FundingArb", () => {
  it("returns pass for insufficient data", () => {
    const fa = new FundingArb(); // lookbackBars = 20
    const bars = Array.from({ length: 19 }, () => bar(100));
    expect(fa.assess(bars, null)).toEqual({ kind: "pass" });
  });

  it("returns pass for empty bars", () => {
    const fa = new FundingArb();
    expect(fa.assess([], null)).toEqual({ kind: "pass" });
  });

  it("returns buy when price significantly below recent average (negative implied funding)", () => {
    const fa = new FundingArb({
      fundingThreshold: 0.01,
      exitThreshold: 0.003,
      lookbackBars: 10,
    });
    // Average of last 10 bars ~100, current price ~85 → implied = (85-100)/100 = -0.15
    const stableBars = Array.from({ length: 9 }, () => bar(102));
    const bars = [...stableBars, bar(85)];
    const result = fa.assess(bars, null);
    expect(result.kind).toBe("buy");
    if (result.kind === "buy") {
      expect(result.conviction).toBeGreaterThanOrEqual(0.3);
      expect(result.conviction).toBeLessThanOrEqual(1.0);
      expect(result.allocation).toBeCloseTo(result.conviction * 0.3, 10);
    }
  });

  it("returns sell when price significantly above recent average", () => {
    const fa = new FundingArb({
      fundingThreshold: 0.01,
      exitThreshold: 0.003,
      lookbackBars: 10,
    });
    // Average ~100, current price ~115 → implied = 0.15
    const stableBars = Array.from({ length: 9 }, () => bar(98));
    const bars = [...stableBars, bar(115)];
    const result = fa.assess(bars, null);
    expect(result.kind).toBe("sell");
    if (result.kind === "sell") {
      expect(result.conviction).toBeGreaterThanOrEqual(0.3);
      expect(result.conviction).toBeLessThanOrEqual(1.0);
      expect(result.allocation).toBeCloseTo(result.conviction * 0.3, 10);
    }
  });

  it("returns pass when within threshold", () => {
    const fa = new FundingArb({
      fundingThreshold: 0.01,
      exitThreshold: 0.003,
      lookbackBars: 10,
    });
    // All bars at ~100, current at 100 → implied = 0
    const bars = Array.from({ length: 10 }, () => bar(100));
    expect(fa.assess(bars, null)).toEqual({ kind: "pass" });
  });

  it("returns exit when funding normalizes with exposure", () => {
    const fa = new FundingArb({
      fundingThreshold: 0.01,
      exitThreshold: 0.003,
      lookbackBars: 10,
    });
    // All bars at 100 → implied = 0 < exitThreshold
    const bars = Array.from({ length: 10 }, () => bar(100));
    const result = fa.assess(bars, longExposure());
    expect(result.kind).toBe("exit");
    if (result.kind === "exit") {
      expect(result.memo).toBe("funding normalized");
    }
  });

  it("returns pass when has exposure but funding has not normalized", () => {
    const fa = new FundingArb({
      fundingThreshold: 0.01,
      exitThreshold: 0.003,
      lookbackBars: 10,
    });
    // Average ~100, current ~90 → |implied| = 0.1 > exitThreshold
    const stableBars = Array.from({ length: 9 }, () => bar(102));
    const bars = [...stableBars, bar(90)];
    const result = fa.assess(bars, longExposure());
    expect(result.kind).toBe("pass");
  });

  it("conviction scales with deviation magnitude", () => {
    const fa = new FundingArb({
      fundingThreshold: 0.01,
      exitThreshold: 0.003,
      lookbackBars: 10,
    });

    // Small deviation
    const barsSmall = [...Array.from({ length: 9 }, () => bar(100)), bar(98.5)];
    const resultSmall = fa.assess(barsSmall, null);

    // Large deviation
    const barsLarge = [...Array.from({ length: 9 }, () => bar(100)), bar(80)];
    const resultLarge = fa.assess(barsLarge, null);

    if (resultSmall.kind === "buy" && resultLarge.kind === "buy") {
      expect(resultLarge.conviction).toBeGreaterThanOrEqual(
        resultSmall.conviction
      );
    }
  });

  it("conviction clamped at 1.0 for extreme deviations", () => {
    const fa = new FundingArb({
      fundingThreshold: 0.01,
      exitThreshold: 0.003,
      lookbackBars: 10,
    });
    const bars = [...Array.from({ length: 9 }, () => bar(100)), bar(50)];
    const result = fa.assess(bars, null);
    if (result.kind === "buy") {
      expect(result.conviction).toBe(1.0);
    }
  });

  it("custom lookback period", () => {
    const fa = new FundingArb({
      fundingThreshold: 0.02,
      exitThreshold: 0.005,
      lookbackBars: 5,
    });
    // 5 bars sufficient
    const bars = Array.from({ length: 5 }, () => bar(100));
    const result = fa.assess(bars, null);
    expect(result.kind).toBe("pass");

    // 4 bars insufficient
    const bars4 = Array.from({ length: 4 }, () => bar(100));
    expect(fa.assess(bars4, null)).toEqual({ kind: "pass" });
  });

  it("has correct label and summary", () => {
    const fa = new FundingArb();
    expect(fa.label).toBe("FundingArb");
    expect(fa.summary).toContain("funding");
  });

  it("handles avgPrice of zero gracefully", () => {
    const fa = new FundingArb({
      fundingThreshold: 0.01,
      exitThreshold: 0.003,
      lookbackBars: 3,
    });
    const bars = [bar(0), bar(0), bar(0)];
    expect(fa.assess(bars, null)).toEqual({ kind: "pass" });
  });

  it("deterministic results", () => {
    const fa = new FundingArb({
      fundingThreshold: 0.01,
      exitThreshold: 0.003,
      lookbackBars: 10,
    });
    const bars = [...Array.from({ length: 9 }, () => bar(100)), bar(85)];
    const r1 = fa.assess(bars, null);
    const r2 = fa.assess(bars, null);
    expect(r1).toEqual(r2);
  });

  it("exits for short exposure when funding normalizes", () => {
    const fa = new FundingArb({
      fundingThreshold: 0.01,
      exitThreshold: 0.003,
      lookbackBars: 10,
    });
    const bars = Array.from({ length: 10 }, () => bar(100));
    const result = fa.assess(bars, shortExposure());
    expect(result.kind).toBe("exit");
    if (result.kind === "exit") {
      expect(result.memo).toBe("funding normalized");
    }
  });
});
