import type { Bar, Exposure, Verdict, Playbook } from "../core/types.js";
import { computeKeltner, computeStochastic } from "../indicators/index.js";

export interface FadeTraderConfig {
  keltnerPeriod: number;
  atrMultiplier: number;
  stochK: number;
  stochD: number;
  stochOB: number;
  stochOS: number;
}

const DEFAULTS: FadeTraderConfig = {
  keltnerPeriod: 20,
  atrMultiplier: 2.0,
  stochK: 14,
  stochD: 3,
  stochOB: 80,
  stochOS: 20,
};

/**
 * FadeTrader — Keltner Channel + Stochastic confirmation.
 * Uses Keltner (EMA + ATR) NOT Bollinger (SMA + stddev).
 * Buy: price below lower Keltner AND stochastic %K < oversold.
 * Sell: price above upper Keltner AND stochastic %K > overbought.
 * Exit: price returns to Keltner basis.
 */
export class FadeTrader implements Playbook {
  readonly label = "FadeTrader";
  readonly summary = "Keltner Channel + Stochastic fade at extremes";
  private cfg: FadeTraderConfig;

  constructor(config?: Partial<FadeTraderConfig>) {
    this.cfg = { ...DEFAULTS, ...config };
  }

  assess(bars: Bar[], exposure: Exposure | null): Verdict {
    const { upper, basis, lower } = computeKeltner(
      bars,
      this.cfg.keltnerPeriod,
      this.cfg.atrMultiplier
    );
    const { k } = computeStochastic(bars, this.cfg.stochK, this.cfg.stochD);

    if (upper.length === 0 || k.length === 0) return { kind: "pass" };

    const price = bars[bars.length - 1].c;
    const lastUpper = upper[upper.length - 1];
    const lastBasis = basis[basis.length - 1];
    const lastLower = lower[lower.length - 1];
    const lastK = k[k.length - 1];

    // Exit check
    if (exposure) {
      const nearBasis =
        Math.abs(price - lastBasis) < Math.abs(lastUpper - lastBasis) * 0.2;
      if (nearBasis)
        return { kind: "exit", memo: "price returned to Keltner basis" };
      return { kind: "pass" };
    }

    // Compute conviction from channel distance and stochastic extremity
    const channelWidth = lastUpper - lastLower;
    if (channelWidth <= 0) return { kind: "pass" };

    // Buy: price below lower channel + stochastic oversold
    if (price < lastLower && lastK < this.cfg.stochOS) {
      const distBeyond = (lastLower - price) / channelWidth;
      const stochExtreme = (this.cfg.stochOS - lastK) / this.cfg.stochOS;
      const conviction = Math.min(
        1.0,
        Math.max(0.3, (distBeyond + stochExtreme) / 2)
      );
      return { kind: "buy", conviction, allocation: conviction * 0.4 };
    }

    // Sell: price above upper channel + stochastic overbought
    if (price > lastUpper && lastK > this.cfg.stochOB) {
      const distBeyond = (price - lastUpper) / channelWidth;
      const stochExtreme =
        (lastK - this.cfg.stochOB) / (100 - this.cfg.stochOB);
      const conviction = Math.min(
        1.0,
        Math.max(0.3, (distBeyond + stochExtreme) / 2)
      );
      return { kind: "sell", conviction, allocation: conviction * 0.4 };
    }

    return { kind: "pass" };
  }
}
