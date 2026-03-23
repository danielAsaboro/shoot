/**
 * Live data adapter for World Cup — maps real Adrena position data
 * into the WorldCupData format consumed by the tournament engine.
 *
 * This allows the World Cup to run against live Adrena wallets instead
 * of synthetic simulation data.
 */

import { prisma } from "../db/client.ts";
import { computeRAROI } from "../competition/engine.ts";
import type {
  AssetClassId,
  DeskDefinition,
  TraderMetrics,
  TraderRecord,
} from "./types.ts";
import type { WorldCupData } from "./engine.ts";
import { loadDesks } from "./data.ts";

/**
 * Convert real competition TraderScore + engagement data into World Cup TraderMetrics.
 */
export function adrenaToWorldCupMetrics(params: {
  pnlPercent: number;
  volumeUsd: number;
  winRate: number;
  consistencyScore: number;
  maxDrawdownPercent: number;
  tradeCount: number;
  activeDays: number;
  totalDays: number;
  questCompletionPercent: number;
  streakDays: number;
  raffleTickets: number;
}): TraderMetrics {
  const {
    pnlPercent,
    volumeUsd,
    winRate,
    consistencyScore,
    maxDrawdownPercent,
    tradeCount,
    activeDays,
    totalDays,
    questCompletionPercent,
    streakDays,
    raffleTickets,
  } = params;

  // RAROI as the core risk-adjusted metric
  const riskAdjustedPnl = computeRAROI({
    pnlPercent,
    winRate,
    activeDays,
    totalDays,
    maxDrawdownPercent,
  });

  // Streak power: mirroring the multiplier bands from streaks.ts
  let streakPower = 0;
  if (streakDays >= 10) streakPower = 100;
  else if (streakDays >= 5) streakPower = 75;
  else if (streakDays >= 3) streakPower = 50;
  else if (streakDays >= 2) streakPower = 30;
  else if (streakDays >= 1) streakPower = 15;

  // Max single-trade share — estimate from volume and trade count
  const avgTradeSize = tradeCount > 0 ? volumeUsd / tradeCount : volumeUsd;
  const maxSingleTradeShare =
    volumeUsd > 0
      ? Math.min(100, (avgTradeSize / volumeUsd) * 100 * 1.5) // ~1.5x average as rough max
      : 100;

  return {
    riskAdjustedPnl: Math.max(0, riskAdjustedPnl),
    consistency: consistencyScore,
    missionProgress: questCompletionPercent,
    streakPower,
    raffleBonus: Math.min(100, raffleTickets * 10),
    weeklyVolume: volumeUsd,
    tradeCount,
    maxSingleTradeShare: Number(maxSingleTradeShare.toFixed(1)),
    activeDays,
    streakDays,
    realizedPnl: pnlPercent,
    drawdown: maxDrawdownPercent,
    raffleTickets,
  };
}

/**
 * Build a WorldCup TraderRecord from a live enrolled wallet's data.
 */
function buildLiveTraderRecord(
  wallet: string,
  displayName: string,
  division: AssetClassId,
  metrics: TraderMetrics
): TraderRecord {
  return {
    id: wallet,
    name: displayName,
    alias: `${wallet.slice(0, 4)}...${wallet.slice(-4)}`,
    specialization: division,
    tag: "live",
    bio: `Live trader in the ${division} division.`,
    baseline: metrics,
    // No scenario overrides for live traders — baseline IS reality
  };
}

/**
 * Determine which asset class division a trader belongs to based on their
 * most-traded markets. Falls back to "crypto" if we can't determine.
 */
function inferDivision(custodyMints: string[]): AssetClassId {
  // These are rough heuristics based on Adrena's custody mint naming
  // In production, this would map against the custody-map.ts definitions
  const mintStr = custodyMints.join(" ").toLowerCase();
  if (
    mintStr.includes("gold") ||
    mintStr.includes("silver") ||
    mintStr.includes("xau")
  )
    return "metals";
  if (
    mintStr.includes("oil") ||
    mintStr.includes("gas") ||
    mintStr.includes("wti")
  )
    return "energy";
  if (
    mintStr.includes("eur") ||
    mintStr.includes("gbp") ||
    mintStr.includes("jpy")
  )
    return "forex";
  return "crypto";
}

/**
 * Load live World Cup traders from the database — uses real TraderScore
 * and engagement data from active competition cohorts.
 */
export async function loadLiveWorldCupTraders(
  division?: AssetClassId
): Promise<TraderRecord[]> {
  // Get latest scores from all enrolled traders
  const scores = await prisma.traderScore.findMany({
    orderBy: { tournamentScore: "desc" },
    take: 128, // Cap to prevent unbounded queries
  });

  // Batch-load engagement data
  const wallets = scores.map((s) => s.wallet);
  const [questRows, streakRows, raffleRows, tradeEvents] = await Promise.all([
    prisma.questProgress.findMany({
      where: { wallet: { in: wallets } },
    }),
    prisma.streakState.findMany({
      where: { wallet: { in: wallets } },
    }),
    prisma.raffleEntry.groupBy({
      by: ["wallet"],
      _sum: { tickets: true },
      where: { wallet: { in: wallets } },
    }),
    prisma.tradeEvent.findMany({
      where: { wallet: { in: wallets } },
      select: { wallet: true, custodyMint: true },
    }),
  ]);

  // Index engagement data by wallet
  const questByWallet = new Map<string, typeof questRows>();
  for (const q of questRows) {
    const list = questByWallet.get(q.wallet) ?? [];
    list.push(q);
    questByWallet.set(q.wallet, list);
  }

  const streakByWallet = new Map<string, number>();
  for (const s of streakRows) {
    streakByWallet.set(s.wallet, s.streakDays);
  }

  const raffleByWallet = new Map<string, number>();
  for (const r of raffleRows) {
    raffleByWallet.set(r.wallet, r._sum.tickets ?? 0);
  }

  const mintsByWallet = new Map<string, string[]>();
  for (const e of tradeEvents) {
    const list = mintsByWallet.get(e.wallet) ?? [];
    list.push(e.custodyMint);
    mintsByWallet.set(e.wallet, list);
  }

  // Build trader records
  const records: TraderRecord[] = [];
  for (const score of scores) {
    const quests = questByWallet.get(score.wallet) ?? [];
    const completedQuests = quests.filter((q) => q.completedAt !== null).length;
    const questCompletionPercent =
      quests.length > 0 ? (completedQuests / quests.length) * 100 : 50; // Default mid-range

    const streakDays = streakByWallet.get(score.wallet) ?? 0;
    const raffleTickets = raffleByWallet.get(score.wallet) ?? 0;
    const mints = mintsByWallet.get(score.wallet) ?? [];
    const traderDivision = inferDivision(mints);

    // Filter by division if specified
    if (division && traderDivision !== division) continue;

    const totalDays = 14; // Default cohort duration

    const metrics = adrenaToWorldCupMetrics({
      pnlPercent: score.pnlPercent,
      volumeUsd: score.volumeUsd,
      winRate: score.winRate,
      consistencyScore: score.consistencyScore,
      maxDrawdownPercent: score.maxDrawdownPercent,
      tradeCount: score.tradeCount,
      activeDays: score.activeDays,
      totalDays,
      questCompletionPercent,
      streakDays,
      raffleTickets,
    });

    const displayName = `${score.wallet.slice(0, 4)}...${score.wallet.slice(-4)}`;
    records.push(
      buildLiveTraderRecord(score.wallet, displayName, traderDivision, metrics)
    );
  }

  return records;
}

/**
 * Load live WorldCupData combining live traders with existing desks.
 */
export async function loadLiveWorldCupData(
  division?: AssetClassId
): Promise<WorldCupData> {
  const [traders, desks] = await Promise.all([
    loadLiveWorldCupTraders(division),
    loadDesks(division),
  ]);

  return { traders, desks };
}
