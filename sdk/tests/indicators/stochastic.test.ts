import { describe, it, expect } from "vitest";
import { computeStochastic } from "../../src/indicators/stochastic.js";
import type { Bar } from "../../src/core/types.js";

const bar = (c: number, h: number, l: number): Bar => ({
  ts: Date.now(),
  o: c,
  h,
  l,
  c,
  vol: 100,
});

describe("computeStochastic", () => {
  it("returns empty for insufficient data", () => {
    const result = computeStochastic([bar(10, 12, 8)], 5, 3);
    expect(result.k).toEqual([]);
  });

  it("returns empty for period <= 0", () => {
    expect(computeStochastic([bar(10, 12, 8)], 0, 3).k).toEqual([]);
    expect(computeStochastic([bar(10, 12, 8)], 3, 0).k).toEqual([]);
  });

  it("%K = 100 when close == highest high", () => {
    const bars = [bar(8, 10, 6), bar(9, 10, 7), bar(10, 10, 8)];
    const { k } = computeStochastic(bars, 3, 1);
    expect(k[0]).toBeCloseTo(100);
  });

  it("%K = 0 when close == lowest low", () => {
    const bars = [bar(10, 12, 8), bar(9, 11, 7), bar(7, 10, 7)];
    const { k } = computeStochastic(bars, 3, 1);
    expect(k[0]).toBeCloseTo(0);
  });

  it("%K = 50 when close is midpoint", () => {
    const bars = [bar(5, 10, 0), bar(5, 10, 0), bar(5, 10, 0)];
    const { k } = computeStochastic(bars, 3, 1);
    expect(k[0]).toBeCloseTo(50);
  });

  it("zero range produces %K = 50", () => {
    const bars = [bar(10, 10, 10), bar(10, 10, 10), bar(10, 10, 10)];
    const { k } = computeStochastic(bars, 3, 1);
    expect(k[0]).toBeCloseTo(50);
  });

  it("%D is SMA of %K", () => {
    const bars = Array.from({ length: 10 }, (_, i) =>
      bar(50 + i, 55 + i, 45 + i)
    );
    const { k, d } = computeStochastic(bars, 3, 3);
    // %D[0] should be average of first 3 %K values
    if (d.length > 0 && k.length >= 3) {
      const expectedD0 = (k[0] + k[1] + k[2]) / 3;
      expect(d[0]).toBeCloseTo(expectedD0);
    }
  });

  it("%K values are between 0 and 100", () => {
    const bars = Array.from({ length: 20 }, (_, i) =>
      bar(100 + Math.sin(i) * 20, 120 + Math.sin(i) * 10, 80 + Math.sin(i) * 10)
    );
    const { k } = computeStochastic(bars, 5, 3);
    k.forEach((v) => {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    });
  });

  it("returns correct %K length", () => {
    const bars = Array.from({ length: 15 }, (_, i) =>
      bar(100 + i, 102 + i, 98 + i)
    );
    const { k } = computeStochastic(bars, 5, 3);
    expect(k).toHaveLength(11); // 15 - 5 + 1
  });

  it("returns correct %D length", () => {
    const bars = Array.from({ length: 15 }, (_, i) =>
      bar(100 + i, 102 + i, 98 + i)
    );
    const { k, d } = computeStochastic(bars, 5, 3);
    expect(d).toHaveLength(k.length - 3 + 1);
  });
});
