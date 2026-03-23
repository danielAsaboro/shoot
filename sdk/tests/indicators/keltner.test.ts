import { describe, it, expect } from "vitest";
import { computeKeltner } from "../../src/indicators/keltner.js";
import type { Bar } from "../../src/core/types.js";

const bar = (c: number, h: number, l: number): Bar => ({
  ts: Date.now(),
  o: c,
  h,
  l,
  c,
  vol: 100,
});

describe("computeKeltner", () => {
  it("returns empty for insufficient data", () => {
    const result = computeKeltner([bar(10, 12, 8)], 5, 2);
    expect(result.upper).toEqual([]);
  });

  it("returns empty for period <= 0", () => {
    expect(computeKeltner([bar(10, 12, 8)], 0, 2).upper).toEqual([]);
  });

  it("upper > basis > lower always", () => {
    const bars = Array.from({ length: 20 }, (_, i) =>
      bar(100 + i, 102 + i, 98 + i)
    );
    const { upper, basis, lower } = computeKeltner(bars, 5, 2);
    for (let i = 0; i < upper.length; i++) {
      expect(upper[i]).toBeGreaterThan(basis[i]);
      expect(basis[i]).toBeGreaterThan(lower[i]);
    }
  });

  it("channels widen with higher multiplier", () => {
    const bars = Array.from({ length: 20 }, (_, i) =>
      bar(100 + i, 105 + i, 95 + i)
    );
    const narrow = computeKeltner(bars, 5, 1);
    const wide = computeKeltner(bars, 5, 3);
    const lastN =
      narrow.upper[narrow.upper.length - 1] -
      narrow.lower[narrow.lower.length - 1];
    const lastW =
      wide.upper[wide.upper.length - 1] - wide.lower[wide.lower.length - 1];
    expect(lastW).toBeGreaterThan(lastN);
  });

  it("flat market produces narrow channels", () => {
    const bars = Array.from({ length: 20 }, () => bar(100, 100, 100));
    const { upper, basis, lower } = computeKeltner(bars, 5, 2);
    if (upper.length > 0) {
      const width = upper[upper.length - 1] - lower[lower.length - 1];
      expect(width).toBeLessThan(1);
    }
  });

  it("all three arrays have equal length", () => {
    const bars = Array.from({ length: 25 }, (_, i) =>
      bar(100 + Math.sin(i) * 10, 105 + Math.sin(i) * 10, 95 + Math.sin(i) * 10)
    );
    const { upper, basis, lower } = computeKeltner(bars, 5, 2);
    expect(upper.length).toBe(basis.length);
    expect(basis.length).toBe(lower.length);
  });

  it("channels are symmetric around basis", () => {
    const bars = Array.from({ length: 20 }, (_, i) =>
      bar(100 + i, 102 + i, 98 + i)
    );
    const { upper, basis, lower } = computeKeltner(bars, 5, 2);
    for (let i = 0; i < upper.length; i++) {
      const distUp = upper[i] - basis[i];
      const distDown = basis[i] - lower[i];
      expect(distUp).toBeCloseTo(distDown);
    }
  });

  it("volatile market produces wider channels", () => {
    const calm = Array.from({ length: 20 }, () => bar(100, 101, 99));
    const wild = Array.from({ length: 20 }, () => bar(100, 120, 80));
    const calmK = computeKeltner(calm, 5, 2);
    const wildK = computeKeltner(wild, 5, 2);
    if (calmK.upper.length > 0 && wildK.upper.length > 0) {
      const calmWidth =
        calmK.upper[calmK.upper.length - 1] -
        calmK.lower[calmK.lower.length - 1];
      const wildWidth =
        wildK.upper[wildK.upper.length - 1] -
        wildK.lower[wildK.upper.length - 1];
      expect(wildWidth).toBeGreaterThan(calmWidth);
    }
  });
});
