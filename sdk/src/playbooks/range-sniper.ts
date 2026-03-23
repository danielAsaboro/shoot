import type { Bar, Exposure, Verdict, Playbook } from "../core/types.js";
import { computeATR, computeVWAP } from "../indicators/index.js";

export interface RangeSniperConfig {
  atrPeriod: number;
  contractionBars: number;
  expansionMult: number;
}

const DEFAULTS: RangeSniperConfig = {
  atrPeriod: 14,
  contractionBars: 5,
  expansionMult: 1.5,
};

/**
 * RangeSniper — ATR contraction/expansion with VWAP deviation.
 * NOT a simple N-period high/low breakout (competitor uses that).
 * Detects volatility squeeze → expansion with directional bias from VWAP.
 */
export class RangeSniper implements Playbook {
  readonly label = "RangeSniper";
  readonly summary =
    "ATR squeeze-expansion detector with VWAP directional bias";
  private cfg: RangeSniperConfig;

  constructor(config?: Partial<RangeSniperConfig>) {
    this.cfg = { ...DEFAULTS, ...config };
  }

  assess(bars: Bar[], exposure: Exposure | null): Verdict {
    const atrs = computeATR(bars, this.cfg.atrPeriod);
    const vwaps = computeVWAP(bars);

    if (atrs.length < this.cfg.contractionBars + 1 || vwaps.length === 0) {
      return { kind: "pass" };
    }

    const price = bars[bars.length - 1].c;
    const lastVwap = vwaps[vwaps.length - 1];
    const currAtr = atrs[atrs.length - 1];

    // Exit: ATR contracts again or price returns to VWAP within 0.5 ATR
    if (exposure) {
      const nearVwap = Math.abs(price - lastVwap) < currAtr * 0.5;
      if (nearVwap) return { kind: "exit", memo: "price returned to VWAP" };

      // Check if ATR is contracting (last 3 declining)
      if (atrs.length >= 3) {
        const a = atrs[atrs.length - 3];
        const b = atrs[atrs.length - 2];
        const c = atrs[atrs.length - 1];
        if (c < b && b < a) return { kind: "exit", memo: "ATR contracting" };
      }
      return { kind: "pass" };
    }

    // Check for contraction: ATR declining for contractionBars consecutive bars
    const recentAtrs = atrs.slice(-(this.cfg.contractionBars + 1));
    let contracting = true;
    for (let i = 1; i < recentAtrs.length - 1; i++) {
      if (recentAtrs[i] >= recentAtrs[i - 1]) {
        contracting = false;
        break;
      }
    }

    if (!contracting) return { kind: "pass" };

    // Check for expansion: current ATR > expansionMult * average of recent ATRs
    const avgRecentAtr =
      recentAtrs.slice(0, -1).reduce((a, b) => a + b, 0) /
      (recentAtrs.length - 1);
    if (avgRecentAtr <= 0) return { kind: "pass" };

    const expansionRatio = currAtr / avgRecentAtr;
    if (expansionRatio < this.cfg.expansionMult) return { kind: "pass" };

    const conviction = Math.min(
      1.0,
      Math.max(0.3, expansionRatio / (this.cfg.expansionMult * 2))
    );

    // Direction from VWAP
    if (price > lastVwap) {
      return { kind: "buy", conviction, allocation: conviction * 0.4 };
    } else {
      return { kind: "sell", conviction, allocation: conviction * 0.4 };
    }
  }
}
