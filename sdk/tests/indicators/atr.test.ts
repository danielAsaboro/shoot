import { describe, it, expect } from "vitest";
import { computeATR } from "../../src/indicators/atr.js";
import type { Bar } from "../../src/core/types.js";

const bar = (c: number, h: number, l: number): Bar => ({
  ts: Date.now(),
  o: c,
  h,
  l,
  c,
  vol: 100,
});

describe("computeATR", () => {
  it("returns empty for period <= 0", () => {
    expect(computeATR([bar(10, 12, 8), bar(11, 13, 9)], 0)).toEqual([]);
    expect(computeATR([bar(10, 12, 8), bar(11, 13, 9)], -1)).toEqual([]);
  });

  it("returns empty for insufficient data", () => {
    expect(computeATR([bar(10, 12, 8)], 2)).toEqual([]);
  });

  it("computes correct ATR for known data", () => {
    // 3 bars, period 1: TR of bar[1] = max(13-9, |13-10|, |9-10|) = 4
    const bars = [bar(10, 12, 8), bar(11, 13, 9), bar(12, 14, 10)];
    const atr = computeATR(bars, 1);
    expect(atr.length).toBeGreaterThan(0);
    expect(atr[0]).toBeCloseTo(4); // first TR as seed
  });

  it("ATR decreases when volatility contracts", () => {
    const bars = [
      bar(100, 110, 90), // wide range
      bar(100, 108, 92),
      bar(100, 106, 94),
      bar(100, 103, 97), // tightening
      bar(100, 102, 98),
      bar(100, 101, 99), // very tight
    ];
    const atr = computeATR(bars, 2);
    expect(atr.length).toBeGreaterThanOrEqual(2);
    expect(atr[atr.length - 1]).toBeLessThan(atr[0]);
  });

  it("ATR is always positive", () => {
    const bars = Array.from({ length: 20 }, (_, i) =>
      bar(100 + i, 102 + i, 98 + i)
    );
    const atr = computeATR(bars, 5);
    atr.forEach((v) => expect(v).toBeGreaterThan(0));
  });

  it("uses previous close for gap calculations", () => {
    // Gap up: prev close 10, current h=20, l=18 → TR = max(2, |20-10|, |18-10|) = 10
    const bars = [bar(10, 12, 8), bar(19, 20, 18)];
    const atr = computeATR(bars, 1);
    expect(atr[0]).toBeCloseTo(10);
  });

  it("handles flat market", () => {
    const bars = Array.from({ length: 10 }, () => bar(100, 100, 100));
    const atr = computeATR(bars, 3);
    atr.forEach((v) => expect(v).toBeCloseTo(0));
  });

  it("returns correct length", () => {
    const bars = Array.from({ length: 15 }, (_, i) =>
      bar(100 + i, 102 + i, 98 + i)
    );
    const atr = computeATR(bars, 5);
    // TRs: 14 values. ATR starts after period seed: 14 - 5 + 1 = 10
    expect(atr).toHaveLength(10);
  });
});
