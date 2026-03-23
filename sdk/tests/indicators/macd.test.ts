import { describe, it, expect } from "vitest";
import { computeMACD } from "../../src/indicators/macd.js";

describe("computeMACD", () => {
  it("returns empty for insufficient data", () => {
    const result = computeMACD([1, 2], 3, 5, 3);
    expect(result.line).toEqual([]);
  });

  it("returns empty for zero/negative periods", () => {
    expect(computeMACD([1, 2, 3, 4, 5], 0, 3, 2).line).toEqual([]);
    expect(computeMACD([1, 2, 3, 4, 5], 2, -1, 2).line).toEqual([]);
  });

  it("line, signal, histogram have same length", () => {
    const closes = Array.from({ length: 30 }, (_, i) => 100 + Math.sin(i) * 10);
    const result = computeMACD(closes, 5, 10, 3);
    expect(result.line.length).toBe(result.signal.length);
    expect(result.line.length).toBe(result.histogram.length);
  });

  it("histogram = line - signal", () => {
    const closes = Array.from({ length: 30 }, (_, i) => 100 + i);
    const { line, signal, histogram } = computeMACD(closes, 5, 10, 3);
    for (let i = 0; i < line.length; i++) {
      expect(histogram[i]).toBeCloseTo(line[i] - signal[i]);
    }
  });

  it("line is positive for uptrend", () => {
    const closes = Array.from({ length: 50 }, (_, i) => 100 + i * 2);
    const { line } = computeMACD(closes, 12, 26, 9);
    // After convergence, fast EMA > slow EMA → positive line
    expect(line[line.length - 1]).toBeGreaterThan(0);
  });

  it("line is negative for downtrend", () => {
    const closes = Array.from({ length: 50 }, (_, i) => 200 - i * 2);
    const { line } = computeMACD(closes, 12, 26, 9);
    expect(line[line.length - 1]).toBeLessThan(0);
  });

  it("histogram crosses zero during trend reversal", () => {
    // Up then down
    const closes = [
      ...Array.from({ length: 30 }, (_, i) => 100 + i),
      ...Array.from({ length: 30 }, (_, i) => 130 - i),
    ];
    const { histogram } = computeMACD(closes, 5, 10, 3);
    const signs = histogram.map((h) => Math.sign(h));
    const hasPositive = signs.some((s) => s > 0);
    const hasNegative = signs.some((s) => s < 0);
    expect(hasPositive).toBe(true);
    expect(hasNegative).toBe(true);
  });

  it("flat input produces near-zero MACD", () => {
    const closes = Array.from({ length: 30 }, () => 100);
    const { line, histogram } = computeMACD(closes, 5, 10, 3);
    line.forEach((v) => expect(Math.abs(v)).toBeLessThan(0.01));
    histogram.forEach((v) => expect(Math.abs(v)).toBeLessThan(0.01));
  });

  it("returns correct length matching input", () => {
    const closes = Array.from({ length: 40 }, (_, i) => 100 + i);
    const { line } = computeMACD(closes, 12, 26, 9);
    expect(line).toHaveLength(40);
  });
});
