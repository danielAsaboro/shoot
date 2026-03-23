import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  selectDailyMissions,
  evaluateBestRoi,
  evaluateMostTrades,
  evaluateHighestVolume,
  evaluateBestWinRate,
  DAILY_MISSION_CATALOG,
} from "../lib/competition/daily-missions.ts";

import type { AdrenaPosition } from "../lib/adrena/client.ts";

// ── Helpers ──────────────────────────────────────────────────────────────────

function mockPosition(
  overrides: Partial<AdrenaPosition> & { exit_date: string },
): AdrenaPosition {
  return {
    position_id: 1,
    user_id: 1,
    symbol: "SOL",
    token_account_mint: "So11111111111111111111111111111111111111112",
    side: "long",
    status: "close",
    pubkey: "11111111111111111111111111111111",
    entry_price: 100,
    exit_price: 110,
    entry_size: 1000,
    pnl: 50,
    entry_leverage: 5,
    entry_date: "2026-03-20T00:00:00.000Z",
    fees: 2,
    collateral_amount: 200,
    ...overrides,
  };
}

const WINDOW_START = new Date("2026-03-22T00:00:00.000Z");
const WINDOW_END = new Date("2026-03-23T00:00:00.000Z");

// ── selectDailyMissions ──────────────────────────────────────────────────────

describe("selectDailyMissions", () => {
  it("returns exactly 3 missions", () => {
    const missions = selectDailyMissions(new Date("2026-03-22"));
    assert.equal(missions.length, 3);
  });

  it("is deterministic — same date yields same missions", () => {
    const a = selectDailyMissions(new Date("2026-03-22"));
    const b = selectDailyMissions(new Date("2026-03-22"));
    assert.deepStrictEqual(
      a.map((m) => m.type),
      b.map((m) => m.type),
    );
  });

  it("different dates produce at least some variety", () => {
    const results = new Set<string>();
    for (let day = 1; day <= 10; day++) {
      const missions = selectDailyMissions(new Date(`2026-03-${String(day).padStart(2, "0")}`));
      results.add(missions.map((m) => m.type).join(","));
    }
    // With 5-choose-3 = 10 combos, 10 different days should yield more than 1 distinct set
    assert.ok(results.size > 1, `Expected variety across 10 days, got ${results.size} unique set(s)`);
  });

  it("every returned mission exists in the catalog", () => {
    const missions = selectDailyMissions(new Date("2026-06-15"));
    const catalogTypes = new Set(DAILY_MISSION_CATALOG.map((m) => m.type));
    for (const m of missions) {
      assert.ok(catalogTypes.has(m.type), `Unknown mission type: ${m.type}`);
    }
  });
});

// ── evaluateBestRoi ──────────────────────────────────────────────────────────

describe("evaluateBestRoi", () => {
  it("ranks wallets by ROI descending", () => {
    const positions = new Map<string, AdrenaPosition[]>([
      [
        "walletA",
        [mockPosition({ pnl: 100, collateral_amount: 200, exit_date: "2026-03-22T10:00:00.000Z" })],
      ],
      [
        "walletB",
        [mockPosition({ pnl: 300, collateral_amount: 200, exit_date: "2026-03-22T12:00:00.000Z" })],
      ],
    ]);

    const results = evaluateBestRoi(positions, WINDOW_START, WINDOW_END);
    assert.equal(results.length, 2);
    assert.equal(results[0].wallet, "walletB"); // 300/200 = 1.5
    assert.equal(results[0].rank, 1);
    assert.equal(results[1].wallet, "walletA"); // 100/200 = 0.5
    assert.equal(results[1].rank, 2);
  });

  it("ignores positions outside the window", () => {
    const positions = new Map<string, AdrenaPosition[]>([
      [
        "walletA",
        [mockPosition({ pnl: 500, collateral_amount: 100, exit_date: "2026-03-21T23:59:59.000Z" })],
      ],
    ]);

    const results = evaluateBestRoi(positions, WINDOW_START, WINDOW_END);
    assert.equal(results.length, 0);
  });
});

// ── evaluateMostTrades ───────────────────────────────────────────────────────

describe("evaluateMostTrades", () => {
  it("counts closed positions correctly", () => {
    const positions = new Map<string, AdrenaPosition[]>([
      [
        "walletA",
        [
          mockPosition({ exit_date: "2026-03-22T01:00:00.000Z" }),
          mockPosition({ exit_date: "2026-03-22T02:00:00.000Z" }),
          mockPosition({ exit_date: "2026-03-22T03:00:00.000Z" }),
        ],
      ],
      [
        "walletB",
        [mockPosition({ exit_date: "2026-03-22T05:00:00.000Z" })],
      ],
    ]);

    const results = evaluateMostTrades(positions, WINDOW_START, WINDOW_END);
    assert.equal(results[0].wallet, "walletA");
    assert.equal(results[0].value, 3);
    assert.equal(results[1].wallet, "walletB");
    assert.equal(results[1].value, 1);
  });

  it("excludes open positions", () => {
    const positions = new Map<string, AdrenaPosition[]>([
      [
        "walletA",
        [
          mockPosition({ status: "open", exit_date: null as unknown as string }),
          mockPosition({ exit_date: "2026-03-22T01:00:00.000Z" }),
        ],
      ],
    ]);

    const results = evaluateMostTrades(positions, WINDOW_START, WINDOW_END);
    assert.equal(results[0].value, 1);
  });
});

// ── evaluateHighestVolume ────────────────────────────────────────────────────

describe("evaluateHighestVolume", () => {
  it("sums entry_size for closed positions", () => {
    const positions = new Map<string, AdrenaPosition[]>([
      [
        "walletA",
        [
          mockPosition({ entry_size: 5000, exit_date: "2026-03-22T10:00:00.000Z" }),
          mockPosition({ entry_size: 3000, exit_date: "2026-03-22T11:00:00.000Z" }),
        ],
      ],
      [
        "walletB",
        [mockPosition({ entry_size: 7000, exit_date: "2026-03-22T12:00:00.000Z" })],
      ],
    ]);

    const results = evaluateHighestVolume(positions, WINDOW_START, WINDOW_END);
    assert.equal(results[0].wallet, "walletA"); // 5000 + 3000 = 8000
    assert.equal(results[0].value, 8000);
    assert.equal(results[1].wallet, "walletB"); // 7000
    assert.equal(results[1].value, 7000);
  });
});

// ── evaluateBestWinRate ──────────────────────────────────────────────────────

describe("evaluateBestWinRate", () => {
  it("requires minimum 3 trades", () => {
    const positions = new Map<string, AdrenaPosition[]>([
      [
        "walletA",
        [
          mockPosition({ pnl: 10, exit_date: "2026-03-22T01:00:00.000Z" }),
          mockPosition({ pnl: 10, exit_date: "2026-03-22T02:00:00.000Z" }),
        ],
      ],
    ]);

    const results = evaluateBestWinRate(positions, WINDOW_START, WINDOW_END);
    assert.equal(results.length, 0);
  });

  it("computes win rate correctly with 3+ trades", () => {
    const positions = new Map<string, AdrenaPosition[]>([
      [
        "walletA",
        [
          mockPosition({ pnl: 50, exit_date: "2026-03-22T01:00:00.000Z" }),
          mockPosition({ pnl: -20, exit_date: "2026-03-22T02:00:00.000Z" }),
          mockPosition({ pnl: 30, exit_date: "2026-03-22T03:00:00.000Z" }),
        ],
      ],
      [
        "walletB",
        [
          mockPosition({ pnl: 10, exit_date: "2026-03-22T04:00:00.000Z" }),
          mockPosition({ pnl: 20, exit_date: "2026-03-22T05:00:00.000Z" }),
          mockPosition({ pnl: 30, exit_date: "2026-03-22T06:00:00.000Z" }),
        ],
      ],
    ]);

    const results = evaluateBestWinRate(positions, WINDOW_START, WINDOW_END);
    assert.equal(results[0].wallet, "walletB"); // 3/3 = 1.0
    assert.ok(Math.abs(results[0].value - 1.0) < 0.001);
    assert.equal(results[1].wallet, "walletA"); // 2/3 ≈ 0.667
    assert.ok(Math.abs(results[1].value - 2 / 3) < 0.001);
  });
});
