import type { TraderRecord, AssetClassId } from "../lib/world-cup/types.ts";

/**
 * Generate test traders for a given division. The engine adds a viewer-trader
 * internally, so passing 31 traders here yields the 32 needed for group stage.
 */
export function generateTestTraders(
  division: AssetClassId,
  count: number
): TraderRecord[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `${division}-test-${i}`,
    name: `Test Trader ${i}`,
    alias: `T${i}`,
    specialization: division,
    tag: "Test",
    bio: "Test trader",
    baseline: {
      riskAdjustedPnl: 60 + (i % 30),
      consistency: 55 + (i % 35),
      missionProgress: 50 + (i % 40),
      streakPower: 50 + (i % 30),
      raffleBonus: 40 + (i % 30),
      weeklyVolume: 100000 + i * 5000,
      tradeCount: 15 + (i % 20),
      maxSingleTradeShare: 20 + (i % 15),
      activeDays: 3 + (i % 4),
      streakDays: 2 + (i % 8),
      realizedPnl: 8000 + i * 500,
      drawdown: 2 + (i % 6),
      raffleTickets: 5 + (i % 8),
    },
  }));
}

/**
 * Build WorldCupData with 31 traders for each specified division.
 * Combined with the viewer-trader the engine adds, each division gets 32.
 */
export function buildTestData(divisions: AssetClassId[]) {
  const traders = divisions.flatMap((div) => generateTestTraders(div, 31));
  return { traders, desks: [] };
}
