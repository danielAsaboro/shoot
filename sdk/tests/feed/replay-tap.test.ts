import { describe, it, expect } from "vitest";
import { ReplayTap } from "../../src/feed/replay-tap.js";
import type { Bar } from "../../src/core/types.js";

const mkBars = (n: number): Bar[] =>
  Array.from({ length: n }, (_, i) => ({
    ts: i,
    o: 100 + i,
    h: 101 + i,
    l: 99 + i,
    c: 100 + i,
    vol: 100,
  }));

describe("ReplayTap", () => {
  it("returns first bar initially", async () => {
    const tap = new ReplayTap(mkBars(5));
    const bar = await tap.getLatestBar("SOL");
    expect(bar.c).toBe(100);
  });

  it("advances cursor", async () => {
    const tap = new ReplayTap(mkBars(5));
    tap.advance();
    const bar = await tap.getLatestBar("SOL");
    expect(bar.c).toBe(101);
  });

  it("clamps cursor at end", async () => {
    const tap = new ReplayTap(mkBars(3));
    tap.advance();
    tap.advance();
    tap.advance();
    tap.advance();
    const bar = await tap.getLatestBar("SOL");
    expect(bar.c).toBe(102);
  });

  it("resets cursor", async () => {
    const tap = new ReplayTap(mkBars(5));
    tap.advance();
    tap.advance();
    tap.reset();
    const bar = await tap.getLatestBar("SOL");
    expect(bar.c).toBe(100);
  });

  it("getBars returns slice up to cursor", async () => {
    const tap = new ReplayTap(mkBars(10));
    for (let i = 0; i < 5; i++) tap.advance();
    const bars = await tap.getBars("SOL", 3);
    expect(bars).toHaveLength(3);
    expect(bars[bars.length - 1].c).toBe(105);
  });

  it("throws on empty bars", async () => {
    const tap = new ReplayTap([]);
    await expect(tap.getLatestBar("SOL")).rejects.toThrow("No bars loaded");
  });

  it("getBars limits to available bars", async () => {
    const tap = new ReplayTap(mkBars(3));
    const bars = await tap.getBars("SOL", 10);
    expect(bars).toHaveLength(1); // only first bar (cursor at 0)
  });
});
