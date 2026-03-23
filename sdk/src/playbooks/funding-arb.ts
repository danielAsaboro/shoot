import type { Bar, Exposure, Verdict, Playbook } from "../core/types.js";

export interface FundingArbConfig {
  fundingThreshold: number;
  exitThreshold: number;
  lookbackBars: number;
}

const DEFAULTS: FundingArbConfig = {
  fundingThreshold: 0.01,
  exitThreshold: 0.003,
  lookbackBars: 20,
};

/**
 * FundingArb — perpetual funding rate exploitation.
 * Unique to perps — no competitor has this.
 * Estimates "implied funding" from price deviation:
 *   impliedFunding = (currentPrice - avgRecentPrice) / avgRecentPrice
 * When implied funding is deeply negative → longs (shorts overcrowded).
 * When deeply positive → shorts (longs overcrowded).
 * Conservative allocation (counter-trend).
 */
export class FundingArb implements Playbook {
  readonly label = "FundingArb";
  readonly summary =
    "Perpetual funding rate mean-reversion via price deviation proxy";
  private cfg: FundingArbConfig;

  constructor(config?: Partial<FundingArbConfig>) {
    this.cfg = { ...DEFAULTS, ...config };
  }

  assess(bars: Bar[], exposure: Exposure | null): Verdict {
    if (bars.length < this.cfg.lookbackBars) return { kind: "pass" };

    const recentBars = bars.slice(-this.cfg.lookbackBars);
    const avgPrice =
      recentBars.reduce((sum, b) => sum + b.c, 0) / recentBars.length;
    if (avgPrice <= 0) return { kind: "pass" };

    const currentPrice = bars[bars.length - 1].c;
    const impliedFunding = (currentPrice - avgPrice) / avgPrice;

    // Exit check
    if (exposure) {
      if (Math.abs(impliedFunding) < this.cfg.exitThreshold) {
        return { kind: "exit", memo: "funding normalized" };
      }
      return { kind: "pass" };
    }

    const conviction = Math.min(
      1.0,
      Math.max(0.3, Math.abs(impliedFunding) / this.cfg.fundingThreshold)
    );

    // Counter-trend: go long when funding is negative (shorts overcrowded)
    if (impliedFunding < -this.cfg.fundingThreshold) {
      return { kind: "buy", conviction, allocation: conviction * 0.3 };
    }

    // Go short when funding is positive (longs overcrowded)
    if (impliedFunding > this.cfg.fundingThreshold) {
      return { kind: "sell", conviction, allocation: conviction * 0.3 };
    }

    return { kind: "pass" };
  }
}
