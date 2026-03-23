/**
 * Revenue Model & ADX Value Accrual
 *
 * Entry fee economics, revenue projections, and ADX accrual mechanisms
 * as defined in PRD v2 Section 12.
 */

import type { ChallengeTierId } from "./types.ts";

// ── Fee Allocation ──────────────────────────────────────────────────────────

export const FEE_ALLOCATION = {
  rewardsPercent: 60,
  adxBuybackPercent: 25,
  rafflePercent: 15,
} as const;

export interface FeeBreakdown {
  totalFees: number;
  rewardsPool: number;
  adxBuyback: number;
  rafflePool: number;
}

export function computeFeeAllocation(
  entryFee: number,
  participantCount: number
): FeeBreakdown {
  const totalFees = entryFee * participantCount;
  return {
    totalFees,
    rewardsPool: totalFees * (FEE_ALLOCATION.rewardsPercent / 100),
    adxBuyback: totalFees * (FEE_ALLOCATION.adxBuybackPercent / 100),
    rafflePool: totalFees * (FEE_ALLOCATION.rafflePercent / 100),
  };
}

// ── Revenue Projections ─────────────────────────────────────────────────────

export interface TierCohortStats {
  tierId: ChallengeTierId;
  entryFee: number;
  expectedCohortSize: number;
  monthlyCohorts: number;
}

export interface MonthlyRevenueProjection {
  tiers: Array<TierCohortStats & { monthlyRevenue: number }>;
  totalMonthlyRevenue: number;
}

export const DEFAULT_TIER_STATS: TierCohortStats[] = [
  { tierId: "scout", entryFee: 2, expectedCohortSize: 80, monthlyCohorts: 12 },
  { tierId: "ranger", entryFee: 5, expectedCohortSize: 60, monthlyCohorts: 10 },
  {
    tierId: "veteran",
    entryFee: 10,
    expectedCohortSize: 40,
    monthlyCohorts: 8,
  },
  { tierId: "elite", entryFee: 25, expectedCohortSize: 25, monthlyCohorts: 6 },
  { tierId: "apex", entryFee: 50, expectedCohortSize: 15, monthlyCohorts: 4 },
];

export function estimateMonthlyRevenue(
  tierStats: TierCohortStats[] = DEFAULT_TIER_STATS
): MonthlyRevenueProjection {
  const tiers = tierStats.map((t) => ({
    ...t,
    monthlyRevenue: t.entryFee * t.expectedCohortSize * t.monthlyCohorts,
  }));

  return {
    tiers,
    totalMonthlyRevenue: tiers.reduce((sum, t) => sum + t.monthlyRevenue, 0),
  };
}

// ── Volume Impact ───────────────────────────────────────────────────────────

export interface TierVolumeStats {
  tierId: ChallengeTierId;
  avgTradesPerCohort: number;
  avgNotionalPerTrade: number;
  participantsPerMonth: number;
}

export interface VolumeImpactProjection {
  tiers: Array<TierVolumeStats & { monthlyVolume: number }>;
  totalMonthlyVolume: number;
  estimatedProtocolFees: number;
}

export const DEFAULT_VOLUME_STATS: TierVolumeStats[] = [
  {
    tierId: "scout",
    avgTradesPerCohort: 8,
    avgNotionalPerTrade: 200,
    participantsPerMonth: 960,
  },
  {
    tierId: "ranger",
    avgTradesPerCohort: 12,
    avgNotionalPerTrade: 800,
    participantsPerMonth: 600,
  },
  {
    tierId: "veteran",
    avgTradesPerCohort: 15,
    avgNotionalPerTrade: 2000,
    participantsPerMonth: 320,
  },
  {
    tierId: "elite",
    avgTradesPerCohort: 20,
    avgNotionalPerTrade: 8000,
    participantsPerMonth: 150,
  },
  {
    tierId: "apex",
    avgTradesPerCohort: 25,
    avgNotionalPerTrade: 20000,
    participantsPerMonth: 60,
  },
];

const CLOSE_FEE_BPS = 8; // 8 bps close fee

export function estimateVolumeImpact(
  volumeStats: TierVolumeStats[] = DEFAULT_VOLUME_STATS
): VolumeImpactProjection {
  const tiers = volumeStats.map((t) => ({
    ...t,
    monthlyVolume:
      t.avgTradesPerCohort * t.avgNotionalPerTrade * t.participantsPerMonth,
  }));

  const totalMonthlyVolume = tiers.reduce((sum, t) => sum + t.monthlyVolume, 0);

  return {
    tiers,
    totalMonthlyVolume,
    estimatedProtocolFees: totalMonthlyVolume * (CLOSE_FEE_BPS / 10000),
  };
}

// ── ADX Value Accrual Mechanisms ─────────────────────────────────────────────

export type ADXAccrualMechanism = {
  id: string;
  label: string;
  description: string;
  estimatedMonthlyImpact: string;
};

export const ADX_ACCRUAL_MECHANISMS: ADXAccrualMechanism[] = [
  {
    id: "entry-fee-buyback",
    label: "25% Entry Fee ADX Buyback",
    description: "Direct buy pressure on ADX from competition revenue",
    estimatedMonthlyImpact: "~$3,700/mo at launch estimates",
  },
  {
    id: "funded-revenue-share",
    label: "Funded Trader Revenue Share in ADX",
    description: "Top traders receive ADX as part of their revenue share",
    estimatedMonthlyImpact: "Increases ADX utility",
  },
  {
    id: "adx-staking-requirement",
    label: "ADX Staking for Funded Status",
    description: "Higher funded levels could require minimum ADX staking",
    estimatedMonthlyImpact: "Creates ADX lock-up / demand sink",
  },
  {
    id: "worldcup-adx-holding",
    label: "World Cup Entry ADX Requirement",
    description: "Qualifying for World Cup could require minimum ADX balance",
    estimatedMonthlyImpact: "Direct participation incentive",
  },
  {
    id: "specialist-adx-multiplier",
    label: "Specialist Bonus × ADX Stake",
    description:
      "Staking ADX could amplify the specialist track bonus multiplier",
    estimatedMonthlyImpact: "Aligns token holding with competition rewards",
  },
];
