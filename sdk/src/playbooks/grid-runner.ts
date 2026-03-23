import type { Bar, Exposure, Verdict, Playbook } from "../core/types.js";
import { computeATR, computeVWAP } from "../indicators/index.js";

export interface GridRunnerConfig {
  gridLevels: number;
  atrPeriod: number;
  gridSpacingAtrFrac: number;
}

const DEFAULTS: GridRunnerConfig = {
  gridLevels: 5,
  atrPeriod: 14,
  gridSpacingAtrFrac: 0.5,
};

/**
 * GridRunner — dynamic grid trading using ATR + VWAP.
 * Places virtual buy/sell levels around VWAP, spaced by ATR fractions.
 * Completely different paradigm from any competitor strategy.
 * Stateful: tracks which grid level was most recently crossed.
 */
export class GridRunner implements Playbook {
  readonly label = "GridRunner";
  readonly summary = "Dynamic ATR-based grid around VWAP anchor";
  private cfg: GridRunnerConfig;
  private lastLevel = 0; // 0 = at center, positive = above, negative = below

  constructor(config?: Partial<GridRunnerConfig>) {
    this.cfg = { ...DEFAULTS, ...config };
  }

  assess(bars: Bar[], exposure: Exposure | null): Verdict {
    const atrs = computeATR(bars, this.cfg.atrPeriod);
    const vwaps = computeVWAP(bars);

    if (atrs.length === 0 || vwaps.length === 0) return { kind: "pass" };

    const price = bars[bars.length - 1].c;
    const center = vwaps[vwaps.length - 1];
    const spacing = atrs[atrs.length - 1] * this.cfg.gridSpacingAtrFrac;

    if (spacing <= 0) return { kind: "pass" };

    // Determine current grid level (how many spacings from center)
    const currentLevel = Math.round((price - center) / spacing);
    const clampedLevel = Math.max(
      -this.cfg.gridLevels,
      Math.min(this.cfg.gridLevels, currentLevel)
    );

    // Exit: if we have exposure and price crossed 2+ levels against us
    if (exposure) {
      const levelDelta = clampedLevel - this.lastLevel;
      if (exposure.direction === "long" && levelDelta <= -2) {
        this.lastLevel = clampedLevel;
        return {
          kind: "exit",
          memo: `price dropped ${Math.abs(levelDelta)} grid levels`,
        };
      }
      if (exposure.direction === "short" && levelDelta >= 2) {
        this.lastLevel = clampedLevel;
        return { kind: "exit", memo: `price rose ${levelDelta} grid levels` };
      }
    }

    // Entry: price crossed to a new grid level
    if (clampedLevel !== this.lastLevel) {
      const direction = clampedLevel > this.lastLevel ? "buy" : "sell";
      this.lastLevel = clampedLevel;

      if (!exposure) {
        return {
          kind: direction,
          conviction: 0.6,
          allocation: 0.2,
        };
      }
    }

    return { kind: "pass" };
  }

  /** Reset grid state (useful for testing) */
  reset(): void {
    this.lastLevel = 0;
  }
}
