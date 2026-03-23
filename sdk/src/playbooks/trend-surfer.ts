import type { Bar, Exposure, Verdict, Playbook } from "../core/types.js";
import { computeMACD } from "../indicators/index.js";

export interface TrendSurferConfig {
  fastLen: number;
  slowLen: number;
  signalLen: number;
}

const DEFAULTS: TrendSurferConfig = { fastLen: 12, slowLen: 26, signalLen: 9 };

/**
 * TrendSurfer — MACD histogram zero-line crossover strategy.
 * NOT an EMA crossover (competitor uses that). Uses histogram momentum.
 * Buy: histogram crosses from negative to positive.
 * Sell: histogram crosses from positive to negative.
 * Exit: histogram crosses against position direction.
 */
export class TrendSurfer implements Playbook {
  readonly label = "TrendSurfer";
  readonly summary = "MACD histogram zero-line crossover for trend detection";
  private cfg: TrendSurferConfig;

  constructor(config?: Partial<TrendSurferConfig>) {
    this.cfg = { ...DEFAULTS, ...config };
  }

  assess(bars: Bar[], exposure: Exposure | null): Verdict {
    if (bars.length < this.cfg.slowLen + 2) return { kind: "pass" };

    const closes = bars.map((b) => b.c);
    const { histogram } = computeMACD(
      closes,
      this.cfg.fastLen,
      this.cfg.slowLen,
      this.cfg.signalLen
    );
    if (histogram.length < 2) return { kind: "pass" };

    const curr = histogram[histogram.length - 1];
    const prev = histogram[histogram.length - 2];

    // Conviction: how strong the histogram signal is
    const maxHist = Math.max(...histogram.map(Math.abs), 0.001);
    const conviction = Math.min(1.0, Math.max(0.3, Math.abs(curr) / maxHist));
    const allocation = conviction * 0.5;

    // If we have exposure, check for exit
    if (exposure) {
      if (exposure.direction === "long" && curr < 0 && prev >= 0) {
        return { kind: "exit", memo: "histogram crossed below zero" };
      }
      if (exposure.direction === "short" && curr > 0 && prev <= 0) {
        return { kind: "exit", memo: "histogram crossed above zero" };
      }
      return { kind: "pass" };
    }

    // No exposure — look for entry
    if (curr > 0 && prev <= 0) {
      return { kind: "buy", conviction, allocation };
    }
    if (curr < 0 && prev >= 0) {
      return { kind: "sell", conviction, allocation };
    }

    return { kind: "pass" };
  }
}
