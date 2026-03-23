import { describe, it, expect, vi } from "vitest";
import { FlightController } from "../../src/cockpit/flight-controller.js";
import { RiskHarness } from "../../src/cockpit/risk-harness.js";
import type {
  Bar,
  Verdict,
  Playbook,
  FlightPlan,
  Guardrails,
} from "../../src/core/types.js";

const guardrails: Guardrails = {
  ceilingLeverage: 5,
  maxExposureFrac: 0.25,
  cutLossPct: 0.03,
  lockGainPct: 0.06,
  pauseMs: 0,
};

const mkBar = (c: number): Bar => ({
  ts: Date.now(),
  o: c,
  h: c + 1,
  l: c - 1,
  c,
  vol: 100,
});

const passPlaybook: Playbook = {
  label: "test",
  summary: "test",
  assess: () => ({ kind: "pass" }),
};

const buyPlaybook: Playbook = {
  label: "test",
  summary: "test",
  assess: () => ({ kind: "buy", conviction: 0.5, allocation: 0.2 }),
};

const plan: FlightPlan = { cadenceMs: 100, symbol: "SOL" };

describe("FlightController", () => {
  it("returns pass when playbook says pass", async () => {
    const harness = new RiskHarness(guardrails, 10000);
    const feed = { getBars: async () => [mkBar(100)] };
    const execute = vi.fn();
    const fc = new FlightController(plan, {
      playbook: passPlaybook,
      harness,
      feed,
      execute,
    });
    const result = await fc.tick();
    expect(result.kind).toBe("pass");
    expect(execute).not.toHaveBeenCalled();
  });

  it("executes buy verdict", async () => {
    const harness = new RiskHarness(guardrails, 10000);
    const feed = { getBars: async () => [mkBar(100)] };
    const execute = vi.fn();
    const fc = new FlightController(plan, {
      playbook: buyPlaybook,
      harness,
      feed,
      execute,
    });
    const result = await fc.tick();
    expect(result.kind).toBe("buy");
    expect(execute).toHaveBeenCalledOnce();
  });

  it("increments tick count", async () => {
    const harness = new RiskHarness(guardrails, 10000);
    const feed = { getBars: async () => [mkBar(100)] };
    const execute = vi.fn();
    const fc = new FlightController(plan, {
      playbook: passPlaybook,
      harness,
      feed,
      execute,
    });
    expect(fc.getTickCount()).toBe(0);
    await fc.tick();
    expect(fc.getTickCount()).toBe(1);
    await fc.tick();
    expect(fc.getTickCount()).toBe(2);
  });

  it("triggers stop-loss from harness", async () => {
    const harness = new RiskHarness(guardrails, 10000);
    harness.openExposure("long", 100, 2000);
    // Price dropped 5%
    const feed = { getBars: async () => [mkBar(95)] };
    const execute = vi.fn();
    const fc = new FlightController(plan, {
      playbook: passPlaybook,
      harness,
      feed,
      execute,
    });
    const result = await fc.tick();
    expect(result.kind).toBe("exit");
    expect(execute).toHaveBeenCalledOnce();
  });

  it("handles empty bars gracefully", async () => {
    const harness = new RiskHarness(guardrails, 10000);
    const feed = { getBars: async () => [] as Bar[] };
    const execute = vi.fn();
    const fc = new FlightController(plan, {
      playbook: passPlaybook,
      harness,
      feed,
      execute,
    });
    const result = await fc.tick();
    expect(result.kind).toBe("pass");
  });

  it("handles feed error gracefully", async () => {
    const harness = new RiskHarness(guardrails, 10000);
    const feed = {
      getBars: async () => {
        throw new Error("network");
      },
    };
    const execute = vi.fn();
    const fc = new FlightController(plan, {
      playbook: passPlaybook,
      harness,
      feed,
      execute,
    });
    const result = await fc.tick();
    expect(result.kind).toBe("pass");
  });

  it("stop() sets running to false", () => {
    const harness = new RiskHarness(guardrails, 10000);
    const feed = { getBars: async () => [mkBar(100)] };
    const execute = vi.fn();
    const fc = new FlightController(plan, {
      playbook: passPlaybook,
      harness,
      feed,
      execute,
    });
    expect(fc.isRunning()).toBe(false);
    fc.stop();
    expect(fc.isRunning()).toBe(false);
  });

  it("opens exposure on buy", async () => {
    const harness = new RiskHarness(guardrails, 10000);
    const feed = { getBars: async () => [mkBar(100)] };
    const execute = vi.fn();
    const fc = new FlightController(plan, {
      playbook: buyPlaybook,
      harness,
      feed,
      execute,
    });
    await fc.tick();
    expect(harness.getExposure()).not.toBeNull();
    expect(harness.getExposure()?.direction).toBe("long");
  });

  it("closes exposure on exit", async () => {
    const harness = new RiskHarness(guardrails, 10000);
    harness.openExposure("long", 100, 2000);
    const exitPlaybook: Playbook = {
      label: "test",
      summary: "test",
      assess: () => ({ kind: "exit", memo: "signal exit" }),
    };
    const feed = { getBars: async () => [mkBar(100)] };
    const execute = vi.fn();
    const fc = new FlightController(plan, {
      playbook: exitPlaybook,
      harness,
      feed,
      execute,
    });
    await fc.tick();
    expect(harness.getExposure()).toBeNull();
  });

  it("sell verdict opens short exposure", async () => {
    const sellPlaybook: Playbook = {
      label: "test",
      summary: "test",
      assess: () => ({ kind: "sell", conviction: 0.5, allocation: 0.2 }),
    };
    const harness = new RiskHarness(guardrails, 10000);
    const feed = { getBars: async () => [mkBar(100)] };
    const execute = vi.fn();
    const fc = new FlightController(plan, {
      playbook: sellPlaybook,
      harness,
      feed,
      execute,
    });
    await fc.tick();
    expect(harness.getExposure()?.direction).toBe("short");
  });
});
