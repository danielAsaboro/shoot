import type { Bar, Verdict, FlightPlan, Playbook } from "../core/types.js";
import { RiskHarness } from "./risk-harness.js";

export interface FlightControllerDeps {
  playbook: Playbook;
  harness: RiskHarness;
  feed: { getBars(symbol: string, limit: number): Promise<Bar[]> };
  execute: (verdict: Verdict) => Promise<void>;
}

export class FlightController {
  private running = false;
  private tickCount = 0;

  constructor(
    private plan: FlightPlan,
    private deps: FlightControllerDeps
  ) {}

  async tick(): Promise<Verdict> {
    this.tickCount++;

    let bars: Bar[];
    try {
      bars = await this.deps.feed.getBars(this.plan.symbol, 100);
    } catch {
      return { kind: "pass" };
    }

    if (bars.length === 0) return { kind: "pass" };

    const currentPrice = bars[bars.length - 1].c;

    // 1. Check guardrails first (stop-loss / take-profit)
    const guardrailVerdict = this.deps.harness.checkGuardrails(currentPrice);
    if (guardrailVerdict.kind === "exit") {
      await this.deps.execute(guardrailVerdict);
      this.deps.harness.closeExposure();
      return guardrailVerdict;
    }

    // 2. Get playbook verdict
    const exposure = this.deps.harness.getExposure();
    const rawVerdict = this.deps.playbook.assess(bars, exposure);

    // 3. Validate through risk harness
    const validated = this.deps.harness.validate(rawVerdict, currentPrice);

    // 4. Execute if actionable
    if (
      validated.kind === "buy" ||
      validated.kind === "sell" ||
      validated.kind === "exit"
    ) {
      await this.deps.execute(validated);

      if (validated.kind === "buy") {
        this.deps.harness.openExposure(
          "long",
          currentPrice,
          validated.allocation * this.deps.harness.getBankroll()
        );
      } else if (validated.kind === "sell") {
        this.deps.harness.openExposure(
          "short",
          currentPrice,
          validated.allocation * this.deps.harness.getBankroll()
        );
      } else if (validated.kind === "exit") {
        this.deps.harness.closeExposure();
      }
    }

    return validated;
  }

  getTickCount(): number {
    return this.tickCount;
  }
  isRunning(): boolean {
    return this.running;
  }

  async start(): Promise<void> {
    this.running = true;
    while (this.running) {
      await this.tick();
      await new Promise((r) => setTimeout(r, this.plan.cadenceMs));
    }
  }

  stop(): void {
    this.running = false;
  }
}
