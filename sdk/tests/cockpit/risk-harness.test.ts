import { describe, it, expect } from "vitest";
import { RiskHarness } from "../../src/cockpit/risk-harness.js";
import type { Verdict, Guardrails } from "../../src/core/types.js";

const guardrails: Guardrails = {
  ceilingLeverage: 5,
  maxExposureFrac: 0.25,
  cutLossPct: 0.03,
  lockGainPct: 0.06,
  pauseMs: 1000,
};

describe("RiskHarness", () => {
  it("passes through pass verdicts", () => {
    const h = new RiskHarness(guardrails, 10000);
    const v: Verdict = { kind: "pass" };
    expect(h.validate(v, 100)).toEqual(v);
  });

  it("passes through exit verdicts", () => {
    const h = new RiskHarness(guardrails, 10000);
    const v: Verdict = { kind: "exit", memo: "test" };
    expect(h.validate(v, 100)).toEqual(v);
  });

  it("allows buy when no exposure and within limits", () => {
    const h = new RiskHarness(guardrails, 10000);
    const v: Verdict = { kind: "buy", conviction: 0.5, allocation: 0.2 };
    const result = h.validate(v, 100, Date.now() + 2000);
    expect(result.kind).toBe("buy");
  });

  it("blocks buy during cooldown", () => {
    const h = new RiskHarness(guardrails, 10000);
    h.openExposure("long", 100, 2000);
    h.closeExposure();
    // Now within cooldown
    const v: Verdict = { kind: "buy", conviction: 0.5, allocation: 0.2 };
    const result = h.validate(v, 100, Date.now()); // same instant
    expect(result.kind).toBe("pass");
  });

  it("blocks buy when already long", () => {
    const h = new RiskHarness(guardrails, 10000);
    h.openExposure("long", 100, 2000);
    const v: Verdict = { kind: "buy", conviction: 0.5, allocation: 0.2 };
    const result = h.validate(v, 100, Date.now() + 2000);
    expect(result.kind).toBe("pass");
  });

  it("allows sell when already long (closing/reversing)", () => {
    const h = new RiskHarness(guardrails, 10000);
    h.openExposure("long", 100, 2000);
    const v: Verdict = { kind: "sell", conviction: 0.5, allocation: 0.2 };
    const result = h.validate(v, 100, Date.now() + 2000);
    expect(result.kind).toBe("sell");
  });

  it("triggers stop-loss", () => {
    const h = new RiskHarness(guardrails, 10000);
    h.openExposure("long", 100, 2000);
    // Price dropped 4% (> 3% cutLossPct)
    const result = h.checkGuardrails(96);
    expect(result.kind).toBe("exit");
    expect((result as { kind: "exit"; memo: string }).memo).toBe("stop-loss");
  });

  it("triggers take-profit", () => {
    const h = new RiskHarness(guardrails, 10000);
    h.openExposure("long", 100, 2000);
    // Price up 7% (> 6% lockGainPct)
    const result = h.checkGuardrails(107);
    expect(result.kind).toBe("exit");
    expect((result as { kind: "exit"; memo: string }).memo).toBe("take-profit");
  });

  it("no guardrail exit within limits", () => {
    const h = new RiskHarness(guardrails, 10000);
    h.openExposure("long", 100, 2000);
    const result = h.checkGuardrails(102);
    expect(result.kind).toBe("pass");
  });

  it("no guardrail exit without exposure", () => {
    const h = new RiskHarness(guardrails, 10000);
    expect(h.checkGuardrails(50).kind).toBe("pass");
  });

  it("short stop-loss works", () => {
    const h = new RiskHarness(guardrails, 10000);
    h.openExposure("short", 100, 2000);
    // Price up 4% (loss for short)
    const result = h.checkGuardrails(104);
    expect(result.kind).toBe("exit");
    expect((result as { kind: "exit"; memo: string }).memo).toBe("stop-loss");
  });

  it("short take-profit works", () => {
    const h = new RiskHarness(guardrails, 10000);
    h.openExposure("short", 100, 2000);
    // Price down 7% (profit for short)
    const result = h.checkGuardrails(93);
    expect(result.kind).toBe("exit");
    expect((result as { kind: "exit"; memo: string }).memo).toBe("take-profit");
  });

  it("tracks bankroll correctly", () => {
    const h = new RiskHarness(guardrails, 5000);
    expect(h.getBankroll()).toBe(5000);
  });
});
