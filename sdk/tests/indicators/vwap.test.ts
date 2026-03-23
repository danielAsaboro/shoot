import { describe, it, expect } from "vitest";
import { computeVWAP } from "../../src/indicators/vwap.js";
import type { Bar } from "../../src/core/types.js";

const bar = (c: number, h?: number, l?: number, vol = 100): Bar => ({
  ts: Date.now(),
  o: c,
  h: h ?? c + 1,
  l: l ?? c - 1,
  c,
  vol,
});

describe("computeVWAP", () => {
  it("returns empty for empty input", () => {
    expect(computeVWAP([])).toEqual([]);
  });

  it("returns typical price for single bar", () => {
    const b = bar(100, 105, 95, 200);
    const vwap = computeVWAP([b]);
    expect(vwap).toHaveLength(1);
    expect(vwap[0]).toBeCloseTo(100); // (105+95+100)/3 = 100
  });

  it("weights by volume", () => {
    const bars = [
      { ts: 1, o: 10, h: 12, l: 8, c: 10, vol: 100 },
      { ts: 2, o: 20, h: 22, l: 18, c: 20, vol: 300 },
    ];
    const vwap = computeVWAP(bars);
    // Bar1 tp = (12+8+10)/3 = 10, pv = 1000
    // Bar2 tp = (22+18+20)/3 = 20, pv = 6000
    // VWAP[1] = 7000 / 400 = 17.5
    expect(vwap[1]).toBeCloseTo(17.5);
  });

  it("handles zero volume bars (uses typical price)", () => {
    const bars = [{ ts: 1, o: 50, h: 55, l: 45, c: 50, vol: 0 }];
    const vwap = computeVWAP(bars);
    expect(vwap[0]).toBeCloseTo(50); // (55+45+50)/3 = 50
  });

  it("VWAP approaches high-volume bar price", () => {
    const bars = [
      { ts: 1, o: 10, h: 10, l: 10, c: 10, vol: 1 },
      { ts: 2, o: 100, h: 100, l: 100, c: 100, vol: 9999 },
    ];
    const vwap = computeVWAP(bars);
    expect(vwap[1]).toBeGreaterThan(99);
  });

  it("returns consistent values for uniform bars", () => {
    const bars = Array.from({ length: 5 }, (_, i) => ({
      ts: i,
      o: 50,
      h: 50,
      l: 50,
      c: 50,
      vol: 100,
    }));
    const vwap = computeVWAP(bars);
    vwap.forEach((v) => expect(v).toBeCloseTo(50));
  });

  it("running VWAP is monotonic for ascending prices with equal volume", () => {
    const bars = Array.from({ length: 10 }, (_, i) => ({
      ts: i,
      o: i * 10,
      h: i * 10,
      l: i * 10,
      c: i * 10,
      vol: 100,
    }));
    const vwap = computeVWAP(bars);
    for (let i = 2; i < vwap.length; i++) {
      expect(vwap[i]).toBeGreaterThanOrEqual(vwap[i - 1]);
    }
  });
});
