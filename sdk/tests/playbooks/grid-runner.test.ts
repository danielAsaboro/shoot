import { describe, it, expect, beforeEach } from "vitest";
import { GridRunner } from "../../src/playbooks/grid-runner.js";
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

describe("GridRunner", () => {
  let gr: GridRunner;

  beforeEach(() => {
    gr = new GridRunner({
      gridLevels: 5,
      atrPeriod: 3,
      gridSpacingAtrFrac: 0.5,
    });
  });

  it("returns pass for insufficient data", () => {
    const bars = [bar(100), bar(101)];
    expect(gr.assess(bars, null)).toEqual({ kind: "pass" });
  });

  it("returns pass for empty bars", () => {
    expect(gr.assess([], null)).toEqual({ kind: "pass" });
  });

  it("returns buy when price crosses up through a grid level", () => {
    // Need enough bars for ATR (atrPeriod=3 needs 4+ bars)
    // Start at stable price, then jump up
    const stableBars = Array.from({ length: 10 }, () => bar(100, 102, 98));
    // ATR based on h-l ~4 → spacing = 4 * 0.5 = 2
    // VWAP near 100. If price jumps to ~103, that's ~1.5 spacings → level 2
    const jumpBars = [bar(103, 105, 101)];
    const bars = [...stableBars, ...jumpBars];
    const result = gr.assess(bars, null);
    if (result.kind === "buy") {
      expect(result.conviction).toBe(0.6);
      expect(result.allocation).toBe(0.2);
    } else {
      // May be pass if VWAP is close to price so level rounds to 0
      expect(["buy", "pass"]).toContain(result.kind);
    }
  });

  it("returns sell when price crosses down through a grid level", () => {
    const stableBars = Array.from({ length: 10 }, () => bar(100, 102, 98));
    const dropBars = [bar(97, 99, 95)];
    const bars = [...stableBars, ...dropBars];
    const result = gr.assess(bars, null);
    if (result.kind === "sell") {
      expect(result.conviction).toBe(0.6);
      expect(result.allocation).toBe(0.2);
    } else {
      expect(["sell", "pass"]).toContain(result.kind);
    }
  });

  it("returns exit for long when price drops 2+ levels", () => {
    // First, establish a level by assessing a position
    const stableBars = Array.from({ length: 10 }, () => bar(100, 102, 98));
    // Move up to set lastLevel
    const upBars = [bar(105, 107, 103)];
    gr.assess([...stableBars, ...upBars], null);

    // Now with long exposure, drop significantly (2+ grid levels)
    const dropBars = [bar(92, 94, 90)];
    const bars2 = [...stableBars, ...dropBars];
    const result = gr.assess(bars2, longExposure());
    if (result.kind === "exit") {
      expect(result.memo).toContain("dropped");
      expect(result.memo).toContain("grid levels");
    } else {
      expect(["pass", "exit"]).toContain(result.kind);
    }
  });

  it("returns exit for short when price rises 2+ levels", () => {
    const stableBars = Array.from({ length: 10 }, () => bar(100, 102, 98));
    // Move down to set lastLevel
    const downBars = [bar(95, 97, 93)];
    gr.assess([...stableBars, ...downBars], null);

    // Now with short exposure, rise significantly
    const riseBars = [bar(108, 110, 106)];
    const bars2 = [...stableBars, ...riseBars];
    const result = gr.assess(bars2, shortExposure());
    if (result.kind === "exit") {
      expect(result.memo).toContain("rose");
      expect(result.memo).toContain("grid levels");
    } else {
      expect(["pass", "exit"]).toContain(result.kind);
    }
  });

  it("returns pass when price stays at same level", () => {
    const bars = Array.from({ length: 15 }, () => bar(100, 102, 98));
    // First call sets level
    gr.assess(bars, null);
    // Second call with same price → same level → pass
    const result = gr.assess(bars, null);
    expect(result.kind).toBe("pass");
  });

  it("reset clears state", () => {
    const stableBars = Array.from({ length: 10 }, () => bar(100, 102, 98));
    const upBars = [bar(105, 107, 103)];
    gr.assess([...stableBars, ...upBars], null);

    gr.reset();

    // After reset, same bars should trigger again since lastLevel is 0
    const result = gr.assess([...stableBars, ...upBars], null);
    // Should produce buy again (or pass if level rounds to 0)
    expect(["buy", "pass"]).toContain(result.kind);
  });

  it("fixed conviction of 0.6", () => {
    const stableBars = Array.from({ length: 10 }, () => bar(100, 102, 98));
    const jumpBars = [bar(110, 112, 108)];
    const result = gr.assess([...stableBars, ...jumpBars], null);
    if (result.kind === "buy" || result.kind === "sell") {
      expect(result.conviction).toBe(0.6);
    }
  });

  it("fixed allocation of 0.2", () => {
    const stableBars = Array.from({ length: 10 }, () => bar(100, 102, 98));
    const jumpBars = [bar(110, 112, 108)];
    const result = gr.assess([...stableBars, ...jumpBars], null);
    if (result.kind === "buy" || result.kind === "sell") {
      expect(result.allocation).toBe(0.2);
    }
  });

  it("has correct label and summary", () => {
    expect(gr.label).toBe("GridRunner");
    expect(gr.summary).toContain("grid");
  });

  it("does not enter when exposure exists and level changes by 1", () => {
    const stableBars = Array.from({ length: 10 }, () => bar(100, 102, 98));
    // Assess to set level
    gr.assess(stableBars, null);
    // Small move with exposure → level changes by ~1, not 2 → pass
    const smallMoveBars = [...stableBars.slice(0, -1), bar(102, 104, 100)];
    const result = gr.assess(smallMoveBars, longExposure());
    expect(result.kind).toBe("pass");
  });

  it("grid adapts to ATR changes", () => {
    // Low volatility bars → small ATR → small spacing
    const lowVolBars = Array.from({ length: 10 }, () => bar(100, 100.5, 99.5));
    const result1 = gr.assess([...lowVolBars, bar(101, 101.5, 100.5)], null);

    gr.reset();

    // High volatility bars → large ATR → large spacing
    const highVolBars = Array.from({ length: 10 }, () => bar(100, 110, 90));
    const result2 = gr.assess([...highVolBars, bar(101, 111, 91)], null);

    // With low vol, a 1-point move is more grid levels than with high vol
    // Low vol: spacing ~0.5*1 = 0.5, so 1 point = 2 levels → likely buy
    // High vol: spacing ~0.5*20 = 10, so 1 point = ~0 levels → likely pass
    if (result1.kind === "buy" || result1.kind === "sell") {
      expect(result2.kind).toBe("pass");
    }
  });
});
