import type { Verdict, Exposure, Guardrails } from "../core/types.js";

export class RiskHarness {
  private lastTradeTs = 0;
  private exposure: Exposure | null = null;

  constructor(
    private guardrails: Guardrails,
    private bankroll: number
  ) {}

  getExposure(): Exposure | null {
    return this.exposure;
  }

  getBankroll(): number {
    return this.bankroll;
  }

  /** Validate a verdict against guardrails */
  validate(verdict: Verdict, currentPrice: number, now = Date.now()): Verdict {
    if (verdict.kind === "pass" || verdict.kind === "exit") return verdict;

    // Cooldown check
    if (now - this.lastTradeTs < this.guardrails.pauseMs) {
      return { kind: "pass" };
    }

    // Already have exposure in same direction
    if (this.exposure) {
      const sameDir =
        (verdict.kind === "buy" && this.exposure.direction === "long") ||
        (verdict.kind === "sell" && this.exposure.direction === "short");
      if (sameDir) return { kind: "pass" };
    }

    // Exposure fraction check
    const tradeNotional = verdict.allocation * this.bankroll;
    if (
      this.bankroll > 0 &&
      tradeNotional / this.bankroll > this.guardrails.maxExposureFrac
    ) {
      return { kind: "pass" };
    }

    // Leverage check
    const impliedLeverage =
      tradeNotional / (this.bankroll * verdict.allocation || 1);
    if (impliedLeverage > this.guardrails.ceilingLeverage) {
      return { kind: "pass" };
    }

    return verdict;
  }

  /** Check if current exposure should be force-exited */
  checkGuardrails(currentPrice: number): Verdict {
    if (!this.exposure) return { kind: "pass" };

    const pnlPct =
      this.exposure.direction === "long"
        ? (currentPrice - this.exposure.entry) / this.exposure.entry
        : (this.exposure.entry - currentPrice) / this.exposure.entry;

    if (pnlPct <= -this.guardrails.cutLossPct) {
      return { kind: "exit", memo: "stop-loss" };
    }
    if (pnlPct >= this.guardrails.lockGainPct) {
      return { kind: "exit", memo: "take-profit" };
    }

    return { kind: "pass" };
  }

  openExposure(direction: "long" | "short", entry: number, size: number): void {
    this.exposure = {
      direction,
      entry,
      size,
      floatingPnl: 0,
      openedAt: Date.now(),
    };
    this.lastTradeTs = Date.now();
  }

  closeExposure(): void {
    this.exposure = null;
    this.lastTradeTs = Date.now();
  }
}
