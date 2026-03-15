import type {
  AssetClassId,
  ScenarioId,
  ScoreWeights,
  Guardrails,
  TraderMetrics,
  TraderRecord,
  AbuseFlag,
  CupDefinition,
  RewardTier,
  DeskDefinition,
  DeskStanding,
  LeaderboardEntry,
  SeasonSimulation,
  PayoutPreviewRow,
  FinalsBracket,
  FinalsMatch,
  GroupMatch,
  GroupMatchResult,
  Group,
  GroupStageBracket,
  KnockoutMatch,
  KnockoutRound,
  MarketTwist,
  GoldenTrade,
  LiveOdds,
  TransferMove,
  ActivatedPowerUp,
} from "./types.ts";
import { defaultWeights } from "./types.ts";
import { cups } from "./cups.ts";
import {
  drawGroups,
  generateRoundRobinSchedule,
  computeGroupStandings,
} from "./group-draw.ts";

// ── Data context passed into engine functions ────────────────────────────────
// All trader/desk data is loaded from the database and passed in, keeping the
// engine pure-functional with no side effects or hardcoded data.

export type WorldCupData = {
  traders: TraderRecord[];
  desks: DeskDefinition[];
  deskAssignments?: Record<string, string>;
  transferMoves?: Record<AssetClassId, TransferMove[]>;
};

/** Viewer desk assignments — one Challenger desk per division */
const VIEWER_DESK_MAP: Record<AssetClassId, string> = {
  crypto: "crypto-latency",
  metals: "metals-vault",
  energy: "energy-refinery",
  forex: "forex-fix",
};

export function clampMetric(value: number) {
  return Math.max(0, Math.min(100, value));
}

export function mergeMetrics(
  baseline: TraderMetrics,
  override?: Partial<TraderMetrics>
): TraderMetrics {
  return {
    ...baseline,
    ...override,
    riskAdjustedPnl: clampMetric(
      override?.riskAdjustedPnl ?? baseline.riskAdjustedPnl
    ),
    consistency: clampMetric(override?.consistency ?? baseline.consistency),
    missionProgress: clampMetric(
      override?.missionProgress ?? baseline.missionProgress
    ),
    streakPower: clampMetric(override?.streakPower ?? baseline.streakPower),
    raffleBonus: clampMetric(override?.raffleBonus ?? baseline.raffleBonus),
  };
}

export function normalizeWeights(weights: ScoreWeights): ScoreWeights {
  const total = Object.values(weights).reduce((sum, value) => sum + value, 0);
  if (total <= 0) {
    return defaultWeights;
  }

  return {
    riskAdjustedPnl: (weights.riskAdjustedPnl / total) * 100,
    consistency: (weights.consistency / total) * 100,
    missionProgress: (weights.missionProgress / total) * 100,
    streakPower: (weights.streakPower / total) * 100,
    raffleBonus: (weights.raffleBonus / total) * 100,
  };
}

export function computeCompositeScore(
  metrics: TraderMetrics,
  weights: ScoreWeights
): number {
  const normalized = normalizeWeights(weights);
  const score =
    metrics.riskAdjustedPnl * (normalized.riskAdjustedPnl / 100) +
    metrics.consistency * (normalized.consistency / 100) +
    metrics.missionProgress * (normalized.missionProgress / 100) +
    metrics.streakPower * (normalized.streakPower / 100) +
    metrics.raffleBonus * (normalized.raffleBonus / 100);

  return Number(score.toFixed(1));
}

export function rewardForRank(cup: CupDefinition, rank: number): RewardTier {
  if (rank === 1) {
    return cup.rewards[0];
  }
  if (rank === 2) {
    return cup.rewards[1];
  }
  if (rank <= 6) {
    return cup.rewards[2];
  }
  return cup.rewards[3];
}

export function deskForTrader(
  trader: TraderRecord,
  data: WorldCupData
): DeskDefinition | undefined {
  const deskId =
    trader.id === "viewer-trader"
      ? VIEWER_DESK_MAP[trader.specialization]
      : data.deskAssignments?.[trader.id];

  return data.desks.find((desk) => desk.id === deskId);
}

export function getViewerDesk(cupId: AssetClassId, data: WorldCupData) {
  return data.desks.find((desk) => desk.id === VIEWER_DESK_MAP[cupId]);
}

export function qualificationForRank(
  cup: CupDefinition,
  rank: number,
  eligible: boolean
): string {
  if (!eligible) {
    return "Ineligible";
  }
  if (rank === 1) {
    return "Cup champion";
  }
  if (rank <= cup.finalsSlots) {
    return "Knockout finals";
  }
  if (rank <= cup.finalsSlots + 2) {
    return "Bubble watch";
  }
  return "Matchday grind";
}

export function shortWallet(address: string) {
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

export function formatCompactUsd(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: value >= 100000 ? 0 : 1,
  }).format(value);
}

export function formatPercent(value: number) {
  return `${value.toFixed(0)}%`;
}

export function evaluateFlags(
  trader: TraderRecord,
  metrics: TraderMetrics,
  guardrails: Guardrails,
  scenarioId: ScenarioId
): AbuseFlag[] {
  const flags: AbuseFlag[] = [];

  if (metrics.weeklyVolume < guardrails.minVolume) {
    flags.push({
      code: "min-volume",
      label: "Below min volume",
      severity: "low",
      reason: `Weekly volume is below the ${formatCompactUsd(guardrails.minVolume)} eligibility threshold.`,
    });
  }

  if (metrics.tradeCount < guardrails.minTrades) {
    flags.push({
      code: "min-trades",
      label: "Below min trades",
      severity: "medium",
      reason: `Trade count is below the required ${guardrails.minTrades} executions.`,
    });
  }

  if (metrics.maxSingleTradeShare > guardrails.maxSingleTradeShare) {
    flags.push({
      code: "single-trade-share",
      label: "Oversized single trade",
      severity: "medium",
      reason: `One trade generated ${metrics.maxSingleTradeShare}% of the total score contribution.`,
    });
  }

  if (trader.manualFlags?.[scenarioId]) {
    flags.push(...trader.manualFlags[scenarioId]);
  }

  return flags;
}

export function createViewerTrader(
  cupId: AssetClassId,
  scenarioId: ScenarioId,
  walletAddress?: string
): TraderRecord {
  const cupNames: Record<AssetClassId, string> = {
    crypto: "RWA crossover with crypto reflexes.",
    metals: "Macro discipline with a clean tape.",
    energy: "Event-window conviction with controlled volatility.",
    forex: "Session-to-session consistency around macro flow.",
  };

  const base: Record<AssetClassId, TraderMetrics> = {
    crypto: {
      riskAdjustedPnl: 74,
      consistency: 72,
      missionProgress: 78,
      streakPower: 70,
      raffleBonus: 67,
      weeklyVolume: 166000,
      tradeCount: 31,
      maxSingleTradeShare: 29,
      activeDays: 5,
      streakDays: 6,
      realizedPnl: 14900,
      drawdown: 4.7,
      raffleTickets: 11,
    },
    metals: {
      riskAdjustedPnl: 72,
      consistency: 80,
      missionProgress: 79,
      streakPower: 73,
      raffleBonus: 65,
      weeklyVolume: 142000,
      tradeCount: 22,
      maxSingleTradeShare: 24,
      activeDays: 5,
      streakDays: 8,
      realizedPnl: 11800,
      drawdown: 3.5,
      raffleTickets: 10,
    },
    energy: {
      riskAdjustedPnl: 79,
      consistency: 67,
      missionProgress: 76,
      streakPower: 69,
      raffleBonus: 60,
      weeklyVolume: 193000,
      tradeCount: 33,
      maxSingleTradeShare: 37,
      activeDays: 6,
      streakDays: 5,
      realizedPnl: 17100,
      drawdown: 5.8,
      raffleTickets: 9,
    },
    forex: {
      riskAdjustedPnl: 73,
      consistency: 82,
      missionProgress: 77,
      streakPower: 78,
      raffleBonus: 66,
      weeklyVolume: 171000,
      tradeCount: 29,
      maxSingleTradeShare: 23,
      activeDays: 6,
      streakDays: 9,
      realizedPnl: 13600,
      drawdown: 3.4,
      raffleTickets: 11,
    },
  };

  const scenarioOverrides: Partial<Record<ScenarioId, Partial<TraderMetrics>>> =
    {
      specialization: {
        missionProgress: base[cupId].missionProgress + 4,
        raffleBonus: base[cupId].raffleBonus + 3,
      },
      bubble: {
        consistency: base[cupId].consistency + 2,
        missionProgress: base[cupId].missionProgress + 6,
        streakPower: base[cupId].streakPower + 4,
        realizedPnl: base[cupId].realizedPnl + 1800,
      },
      finals: {
        riskAdjustedPnl: base[cupId].riskAdjustedPnl + 5,
        consistency: base[cupId].consistency + 4,
        missionProgress: base[cupId].missionProgress + 2,
        streakPower: base[cupId].streakPower + 5,
        realizedPnl: base[cupId].realizedPnl + 4200,
      },
      integrity: {
        missionProgress: base[cupId].missionProgress - 2,
      },
    };

  return {
    id: "viewer-trader",
    name: walletAddress ? shortWallet(walletAddress) : "Ayo Cole",
    alias: "You",
    specialization: cupId,
    tag: "Adrena hopeful",
    bio: cupNames[cupId],
    baseline: base[cupId],
    scenarioOverrides,
  };
}

export function createCupLeaderboard({
  cupId,
  scenarioId,
  weights,
  guardrails,
  walletAddress,
  data,
}: {
  cupId: AssetClassId;
  scenarioId: ScenarioId;
  weights: ScoreWeights;
  guardrails: Guardrails;
  walletAddress?: string;
  data: WorldCupData;
}): LeaderboardEntry[] {
  const cup = cups.find((item) => item.id === cupId);
  if (!cup) {
    return [];
  }

  const viewerTrader = createViewerTrader(cupId, scenarioId, walletAddress);
  const roster = [
    viewerTrader,
    ...data.traders.filter((trader) => trader.specialization === cupId),
  ];

  const scored = roster.map((trader) => {
    const metrics = mergeMetrics(
      trader.baseline,
      trader.scenarioOverrides?.[scenarioId]
    );
    const flags = evaluateFlags(trader, metrics, guardrails, scenarioId);
    const eligible =
      !flags.some((flag) => flag.severity === "high") &&
      metrics.weeklyVolume >= guardrails.minVolume &&
      metrics.tradeCount >= guardrails.minTrades &&
      metrics.maxSingleTradeShare <= guardrails.maxSingleTradeShare;

    return {
      trader,
      metrics,
      score: computeCompositeScore(metrics, weights),
      eligible,
      flags,
    };
  });

  const sorted = [...scored].sort((left, right) => {
    if (left.eligible !== right.eligible) {
      return left.eligible ? -1 : 1;
    }
    if (right.score !== left.score) {
      return right.score - left.score;
    }
    if (right.metrics.consistency !== left.metrics.consistency) {
      return right.metrics.consistency - left.metrics.consistency;
    }
    return left.metrics.drawdown - right.metrics.drawdown;
  });

  return sorted.map((entry, index) => {
    const rank = index + 1;
    return {
      ...entry,
      rank,
      qualification: qualificationForRank(cup, rank, entry.eligible),
      reward: rewardForRank(cup, rank),
    };
  });
}

export function createGrandFinalists({
  scenarioId,
  weights,
  guardrails,
  walletAddress,
  data,
}: {
  scenarioId: ScenarioId;
  weights: ScoreWeights;
  guardrails: Guardrails;
  walletAddress?: string;
  data: WorldCupData;
}): LeaderboardEntry[] {
  const finalists = cups
    .map((cup) =>
      createCupLeaderboard({
        cupId: cup.id,
        scenarioId,
        weights,
        guardrails,
        walletAddress,
        data,
      }).find((entry) => entry.eligible)
    )
    .filter(Boolean) as LeaderboardEntry[];

  return finalists
    .sort((left, right) => right.score - left.score)
    .map((entry, index) => ({
      ...entry,
      rank: index + 1,
    }));
}

export function createDeskStandings({
  cupId,
  scenarioId,
  weights,
  guardrails,
  walletAddress,
  data,
}: {
  cupId: AssetClassId;
  scenarioId: ScenarioId;
  weights: ScoreWeights;
  guardrails: Guardrails;
  walletAddress?: string;
  data: WorldCupData;
}): DeskStanding[] {
  const leaderboard = createCupLeaderboard({
    cupId,
    scenarioId,
    weights,
    guardrails,
    walletAddress,
    data,
  });

  const desks = data.desks.filter((desk) => desk.cupId === cupId);

  const standings = desks.map((desk) => {
    const members = leaderboard.filter(
      (entry) => deskForTrader(entry.trader, data)?.id === desk.id
    );
    const supporterBonus = Number(
      Math.min(4.5, desk.supporters / 600).toFixed(1)
    );
    const averageScore =
      members.reduce((sum, entry) => sum + entry.score, 0) /
      Math.max(1, members.length);
    const missionBonus =
      members.reduce((sum, entry) => sum + entry.metrics.missionProgress, 0) /
      Math.max(1, members.length) /
      10;
    const score = Number(
      (averageScore + missionBonus + supporterBonus).toFixed(1)
    );
    const topPerformer =
      members.sort((left, right) => right.score - left.score)[0]?.trader
        .alias ?? "TBD";

    return {
      desk,
      score,
      averageScore: Number(averageScore.toFixed(1)),
      memberCount: members.length,
      memberAliases: members.map((entry) => entry.trader.alias),
      promotion: "Stable",
      supporterBonus,
      topPerformer,
    };
  });

  return standings
    .sort((left, right) => right.score - left.score)
    .map((standing, index, sorted) => ({
      ...standing,
      promotion:
        index === 0
          ? sorted[index].desk.tier === "Challenger"
            ? "Promoted"
            : "Holding Premier seat"
          : index === sorted.length - 1
            ? sorted[index].desk.tier === "Premier"
              ? "Relegation risk"
              : "Needs playoff win"
            : "Stable",
    }));
}

export function createSeasonSimulation({
  weights,
  guardrails,
}: {
  weights: ScoreWeights;
  guardrails: Guardrails;
}): SeasonSimulation {
  const normalized = normalizeWeights(weights);
  const engagementFactor =
    normalized.missionProgress * 0.5 +
    normalized.streakPower * 0.8 +
    normalized.raffleBonus * 0.7;
  const integrityFactor =
    (guardrails.minTrades - 6) * 1.1 +
    (200000 - guardrails.minVolume) / 7000 +
    (70 - guardrails.maxSingleTradeShare) * 1.4;

  const dailyReturn = Number((32 + engagementFactor * 0.45).toFixed(0));
  const comebackRate = Number((18 + engagementFactor * 0.55).toFixed(0));
  const midTableRetention = Number((27 + engagementFactor * 0.62).toFixed(0));
  const rewardConcentration = Number(
    Math.max(38, 63 - engagementFactor * 0.4 - integrityFactor * 0.2).toFixed(0)
  );
  const competitionVolumeShare = Number(
    Math.min(66, 50 + engagementFactor * 0.28).toFixed(0)
  );
  const integrityCoverage = Number(
    Math.min(89, 54 + integrityFactor * 0.52).toFixed(0)
  );

  return {
    headline:
      "World Cup 2.0 turns competitions into a season loop, not a signup spike.",
    summary:
      "Projected uplift is driven by mission-linked scoring, streak pressure, desk identity, and stricter payout eligibility.",
    metrics: [
      {
        label: "Daily return rate",
        baseline: 32,
        projected: dailyReturn,
        suffix: "%",
        betterDirection: "higher",
        summary:
          "Measures how often participants come back day-to-day during the season.",
      },
      {
        label: "Comeback after red day",
        baseline: 18,
        projected: comebackRate,
        suffix: "%",
        betterDirection: "higher",
        summary: "Shows whether traders keep playing after a losing session.",
      },
      {
        label: "Mid-table retention",
        baseline: 27,
        projected: midTableRetention,
        suffix: "%",
        betterDirection: "higher",
        summary:
          "The key anti-decay metric for anyone outside the top few ranks.",
      },
      {
        label: "Reward concentration in top 10%",
        baseline: 63,
        projected: rewardConcentration,
        suffix: "%",
        betterDirection: "lower",
        summary:
          "Lower is better: it means rewards are felt beyond the elite cluster.",
      },
      {
        label: "Competition share of volume",
        baseline: 50,
        projected: competitionVolumeShare,
        suffix: "%",
        betterDirection: "higher",
        summary:
          "Anchored to Adrena's 2025 competition share and pushed by better retention loops.",
      },
      {
        label: "Integrity review coverage",
        baseline: 54,
        projected: integrityCoverage,
        suffix: "%",
        betterDirection: "higher",
        summary:
          "The share of payout-relevant rows that clear guardrails before rewards lock.",
      },
    ],
  };
}

export function createTransferWindow(cupId: AssetClassId, data: WorldCupData) {
  return data.transferMoves?.[cupId] ?? [];
}

export function createPayoutPreview({
  cupId,
  scenarioId,
  weights,
  guardrails,
  walletAddress,
  data,
}: {
  cupId: AssetClassId;
  scenarioId: ScenarioId;
  weights: ScoreWeights;
  guardrails: Guardrails;
  walletAddress?: string;
  data: WorldCupData;
}): PayoutPreviewRow[] {
  const standings = createCupLeaderboard({
    cupId,
    scenarioId,
    weights,
    guardrails,
    walletAddress,
    data,
  });

  return standings.slice(0, 6).map((entry) => ({
    rank: `#${entry.rank}`,
    recipient: entry.trader.alias,
    payout: entry.eligible ? entry.reward.payout : "Review hold",
    status: entry.eligible ? "Approved" : "Pending review",
    reason: entry.eligible
      ? entry.reward.label
      : entry.flags.map((flag) => flag.label).join(", "),
  }));
}

export function resolveMatch(
  label: string,
  left?: LeaderboardEntry,
  right?: LeaderboardEntry
): FinalsMatch {
  if (!left || !right) {
    return {
      label,
      left,
      right,
      winner: left ?? right,
      margin: 0,
    };
  }

  const leftPower = left.score + left.metrics.consistency * 0.08;
  const rightPower = right.score + right.metrics.consistency * 0.08;
  const winner = leftPower >= rightPower ? left : right;

  return {
    label,
    left,
    right,
    winner,
    margin: Number(Math.abs(leftPower - rightPower).toFixed(1)),
  };
}

export function createFinalsBracket({
  scenarioId,
  weights,
  guardrails,
  walletAddress,
  data,
}: {
  scenarioId: ScenarioId;
  weights: ScoreWeights;
  guardrails: Guardrails;
  walletAddress?: string;
  data: WorldCupData;
}): FinalsBracket {
  const finalists = createGrandFinalists({
    scenarioId,
    weights,
    guardrails,
    walletAddress,
    data,
  });

  const semiFinals = [
    resolveMatch("Semi-final A", finalists[0], finalists[3]),
    resolveMatch("Semi-final B", finalists[1], finalists[2]),
  ];
  const final = resolveMatch(
    "Grand Final",
    semiFinals[0]?.winner,
    semiFinals[1]?.winner
  );

  return {
    semiFinals,
    final,
  };
}

// ── Seeded PRNG for deterministic simulation ───────────────────────────────────

function createEngineRng(seed: number) {
  let s = seed | 0;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

function hashEngineSeed(str: string): number {
  let hash = 6151;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

// ── Group match simulation ─────────────────────────────────────────────────────

export function simulateGroupMatch(
  traderA: LeaderboardEntry,
  traderB: LeaderboardEntry,
  matchday: number,
  groupId: string,
  division: AssetClassId,
  _twistMarket?: string
): GroupMatch {
  const rng = createEngineRng(
    hashEngineSeed(`${groupId}-${traderA.trader.id}-${traderB.trader.id}-${matchday}`)
  );

  // Base RAROI from trader metrics with noise — ±12 range to allow genuine upsets
  const noiseA = (rng() - 0.5) * 24;
  const noiseB = (rng() - 0.5) * 24;
  const raroiA = Number(
    (traderA.metrics.riskAdjustedPnl * 0.6 + traderA.metrics.consistency * 0.2 + noiseA).toFixed(2)
  );
  const raroiB = Number(
    (traderB.metrics.riskAdjustedPnl * 0.6 + traderB.metrics.consistency * 0.2 + noiseB).toFixed(2)
  );

  const diff = raroiA - raroiB;
  let result: GroupMatchResult;
  if (Math.abs(diff) <= 2.5) {
    result = "draw";
  } else if (diff > 0) {
    result = "win";
  } else {
    result = "loss";
  }

  return {
    groupId,
    division,
    traderA: traderA.trader,
    traderB: traderB.trader,
    raroiA,
    raroiB,
    result,
    matchWindow: `MD${matchday}`,
    matchday,
  };
}

// ── Run group stage ────────────────────────────────────────────────────────────

export function runGroupStage(
  qualifiers: LeaderboardEntry[],
  division: AssetClassId
): Group[] {
  const groups = drawGroups(qualifiers, division);

  for (const group of groups) {
    const schedule = generateRoundRobinSchedule(group);

    group.matches = schedule.map((fixture) =>
      simulateGroupMatch(
        fixture.traderA,
        fixture.traderB,
        fixture.matchday,
        group.id,
        division
      )
    );

    group.standings = computeGroupStandings(group);
  }

  return groups;
}

// ── Create expanded leaderboard (32 per division) ──────────────────────────────

export function createExpandedLeaderboard({
  cupId,
  scenarioId,
  weights,
  guardrails,
  walletAddress,
  data,
}: {
  cupId: AssetClassId;
  scenarioId: ScenarioId;
  weights: ScoreWeights;
  guardrails: Guardrails;
  walletAddress?: string;
  data: WorldCupData;
}): LeaderboardEntry[] {
  const cup = cups.find((item) => item.id === cupId);
  if (!cup) return [];

  const viewerTrader = createViewerTrader(cupId, scenarioId, walletAddress);
  const roster = [
    viewerTrader,
    ...data.traders.filter((trader) => trader.specialization === cupId),
  ];

  const scored = roster.map((trader) => {
    const metrics = mergeMetrics(
      trader.baseline,
      trader.scenarioOverrides?.[scenarioId]
    );
    const flags = evaluateFlags(trader, metrics, guardrails, scenarioId);
    const eligible =
      !flags.some((flag) => flag.severity === "high") &&
      metrics.weeklyVolume >= guardrails.minVolume &&
      metrics.tradeCount >= guardrails.minTrades &&
      metrics.maxSingleTradeShare <= guardrails.maxSingleTradeShare;

    return {
      trader,
      metrics,
      score: computeCompositeScore(metrics, weights),
      eligible,
      flags,
    };
  });

  const sorted = [...scored].sort((left, right) => {
    if (left.eligible !== right.eligible) return left.eligible ? -1 : 1;
    if (right.score !== left.score) return right.score - left.score;
    if (right.metrics.consistency !== left.metrics.consistency)
      return right.metrics.consistency - left.metrics.consistency;
    return left.metrics.drawdown - right.metrics.drawdown;
  });

  return sorted.map((entry, index) => {
    const rank = index + 1;
    return {
      ...entry,
      rank,
      qualification: qualificationForRank(cup, rank, entry.eligible),
      reward: rewardForRank(cup, rank),
    };
  });
}

// ── Captain's Pick ─────────────────────────────────────────────────────────────

// ── Knockout match resolution ────────────────────────────────────────────────

export function resolveKnockoutMatch(
  id: string,
  label: string,
  round: KnockoutRound,
  left?: LeaderboardEntry,
  right?: LeaderboardEntry,
  twistMarket?: string,
  activePowerUps?: ActivatedPowerUp[]
): KnockoutMatch {
  const base: KnockoutMatch = {
    id,
    label,
    round,
    left,
    right,
    margin: 0,
    twistMarket,
  };

  if (!left || !right) {
    base.winner = left ?? right;
    return base;
  }

  const rng = createEngineRng(
    hashEngineSeed(`${id}-${left.trader.id}-${right.trader.id}`)
  );

  let leftRaroi =
    left.metrics.riskAdjustedPnl +
    left.metrics.consistency * 0.08 +
    (rng() - 0.4) * 8;
  let rightRaroi =
    right.metrics.riskAdjustedPnl +
    right.metrics.consistency * 0.08 +
    (rng() - 0.4) * 8;

  // Apply power-ups if any are active for this match
  if (activePowerUps) {
    const rawMargin = Math.abs(leftRaroi - rightRaroi);
    const leftPowerUp = activePowerUps.find(
      (p) => p.wallet === left.trader.id && p.matchId === id && !p.consumed
    );
    const rightPowerUp = activePowerUps.find(
      (p) => p.wallet === right.trader.id && p.matchId === id && !p.consumed
    );

    const leftResult = applyPowerUp(leftRaroi, leftPowerUp, rawMargin);
    const rightResult = applyPowerUp(rightRaroi, rightPowerUp, rawMargin);
    leftRaroi = leftResult.adjustedRaroi;
    rightRaroi = rightResult.adjustedRaroi;

    if (leftPowerUp && leftResult.powerUpUsed) leftPowerUp.consumed = true;
    if (rightPowerUp && rightResult.powerUpUsed) rightPowerUp.consumed = true;
  }

  const margin = Math.abs(leftRaroi - rightRaroi);

  // Close match: use consistency as tiebreaker
  if (margin < 0.5) {
    base.winner =
      left.metrics.consistency >= right.metrics.consistency ? left : right;
    base.margin = Number(Math.max(margin, 0.1).toFixed(1));
    return base;
  }

  base.winner = leftRaroi > rightRaroi ? left : right;
  base.margin = Number(margin.toFixed(1));
  return base;
}

// ── Power-Up Application ──────────────────────────────────────────────────────

import { POWER_UP_CATALOG, KNOCKOUT_BUYIN_USDC, FUNDED_TRADER_BUYIN_EXEMPT } from "./types.ts";

/**
 * Apply a power-up to a knockout match's RAROI computation.
 *
 * - Mulligan: remove the worst trade from scoring (simulated as +5% RAROI boost)
 * - Double Points: 2x multiplier on the trader's RAROI for the match
 * - Market Swap: no RAROI change (handled at market selection level)
 * - Overtime Shield: if margin < 5%, extend match (simulated as re-roll with narrower noise)
 */
export function applyPowerUp(
  baseRaroi: number,
  powerUp: ActivatedPowerUp | undefined,
  matchMargin: number
): { adjustedRaroi: number; powerUpUsed: boolean; description?: string } {
  if (!powerUp || powerUp.consumed) {
    return { adjustedRaroi: baseRaroi, powerUpUsed: false };
  }

  const catalog = POWER_UP_CATALOG.find((p) => p.type === powerUp.type);
  if (!catalog) {
    return { adjustedRaroi: baseRaroi, powerUpUsed: false };
  }

  switch (powerUp.type) {
    case "mulligan":
      // Remove worst trade impact: boost RAROI by up to 5 points (capped)
      return {
        adjustedRaroi: baseRaroi + Math.min(5, Math.abs(baseRaroi) * 0.15),
        powerUpUsed: true,
        description: "Mulligan: worst trade excluded from scoring",
      };

    case "double_points":
      return {
        adjustedRaroi: baseRaroi * 2,
        powerUpUsed: true,
        description: "Double Points: 2x scoring multiplier active",
      };

    case "market_swap":
      // Market swap doesn't change RAROI — it changes which market is scored.
      // Actual market validation happens at trade filtering level.
      return {
        adjustedRaroi: baseRaroi,
        powerUpUsed: true,
        description: `Market Swap: division market changed`,
      };

    case "overtime_shield":
      // If match is close (margin < 5%), grant a RAROI bonus from the overtime period
      if (matchMargin < 5) {
        return {
          adjustedRaroi: baseRaroi + 2.5,
          powerUpUsed: true,
          description: "Overtime Shield: match extended 12h, bonus RAROI applied",
        };
      }
      // Match wasn't close enough — shield wasted
      return {
        adjustedRaroi: baseRaroi,
        powerUpUsed: false,
        description: "Overtime Shield: margin too wide, shield did not activate",
      };

    default:
      return { adjustedRaroi: baseRaroi, powerUpUsed: false };
  }
}

/**
 * Calculate knockout buy-in fee for a trader.
 * Funded traders are exempt.
 */
export function getKnockoutBuyinUsdc(isFundedTrader: boolean): number {
  if (isFundedTrader && FUNDED_TRADER_BUYIN_EXEMPT) return 0;
  return KNOCKOUT_BUYIN_USDC;
}

// ── Market Twists ──────────────────────────────────────────────────────────────

export function getDefaultTwists(): MarketTwist[] {
  const now = Date.now();
  return [
    {
      round: "quarterfinal",
      market: "XAU",
      label: "The Gold Round",
      description:
        "All divisions must include at least one Gold trade in their scoring window.",
      announcedAt: now - 3600000,
    },
    {
      round: "semifinal",
      market: "RANDOM",
      label: "The Chaos Round",
      description:
        "A random market from a different division is forced into each trader's portfolio.",
      announcedAt: now - 1800000,
    },
  ];
}

// ── Golden Trade tracker ───────────────────────────────────────────────────────

export function findGoldenTrade(
  bracket: GroupStageBracket
): GoldenTrade {
  const rng = createEngineRng(
    hashEngineSeed(`golden-${bracket.division}`)
  );

  // Find the best performer across all knockout matches
  const allMatches = [
    ...bracket.roundOf16,
    ...bracket.quarterFinals,
    ...bracket.semiFinals,
    bracket.final,
  ];

  let bestEntry: LeaderboardEntry | undefined;
  let bestPnl = 0;

  for (const match of allMatches) {
    if (match.winner) {
      const pnl = match.winner.metrics.realizedPnl * (0.5 + rng() * 1.5);
      if (pnl > bestPnl) {
        bestPnl = pnl;
        bestEntry = match.winner;
      }
    }
  }

  const markets: Record<AssetClassId, string[]> = {
    crypto: ["BTC", "ETH", "SOL"],
    metals: ["XAU", "XAG"],
    energy: ["WTI", "Brent"],
    forex: ["EUR/USD", "GBP/USD"],
  };

  const divMarkets = markets[bracket.division] ?? ["BTC"];
  const market = divMarkets[Math.floor(rng() * divMarkets.length)];
  const leverage = Math.round(3 + rng() * 17);
  const pnlPercent = Number((bestPnl / 1000 * leverage * 0.01).toFixed(1));

  return {
    traderId: bestEntry?.trader.id ?? "unknown",
    alias: bestEntry?.trader.alias ?? "Unknown",
    market,
    direction: rng() > 0.5 ? "long" : "short",
    pnlUsd: Math.round(bestPnl),
    pnlPercent,
    leverage,
    timestamp: Date.now() - Math.floor(rng() * 7200000),
    matchContext: `${bracket.division} knockout stage`,
  };
}

// ── Live Odds ──────────────────────────────────────────────────────────────────

export function computeLiveOdds(match: KnockoutMatch): LiveOdds {
  if (!match.left || !match.right) {
    return {
      matchId: match.id,
      leftWinProb: match.left ? 1 : 0,
      rightWinProb: match.right ? 1 : 0,
      drawProb: 0,
      trendDirection: "stable",
    };
  }

  const leftPower =
    match.left.score + match.left.metrics.consistency * 0.05;
  const rightPower =
    match.right.score + match.right.metrics.consistency * 0.05;
  const total = leftPower + rightPower;

  const leftProb = Number((leftPower / total).toFixed(3));
  const rightProb = Number((rightPower / total).toFixed(3));
  const drawProb = Number(
    Math.max(0, 0.15 - Math.abs(leftProb - rightProb) * 0.5).toFixed(3)
  );

  const adjustedLeft = Number(((leftProb * (1 - drawProb))).toFixed(3));
  const adjustedRight = Number(((rightProb * (1 - drawProb))).toFixed(3));

  const diff = Math.abs(leftPower - rightPower);
  const trend: "gaining" | "losing" | "stable" =
    diff < 2 ? "stable" : leftPower > rightPower ? "gaining" : "losing";

  return {
    matchId: match.id,
    leftWinProb: adjustedLeft,
    rightWinProb: adjustedRight,
    drawProb,
    trendDirection: trend,
  };
}

// ── Full bracket creation ──────────────────────────────────────────────────────

export function createFullBracket({
  cupId,
  scenarioId,
  weights,
  guardrails,
  walletAddress,
  twists,
  data,
}: {
  cupId: AssetClassId;
  scenarioId: ScenarioId;
  weights: ScoreWeights;
  guardrails: Guardrails;
  walletAddress?: string;
  twists?: MarketTwist[];
  data: WorldCupData;
}): GroupStageBracket {
  // 1. Create expanded leaderboard (32 qualifiers)
  const leaderboard = createExpandedLeaderboard({
    cupId,
    scenarioId,
    weights,
    guardrails,
    walletAddress,
    data,
  });

  const eligible = leaderboard.filter((e) => e.eligible).slice(0, 32);

  // Pad to 32 if not enough eligible
  const qualifiers =
    eligible.length >= 32
      ? eligible
      : [...eligible, ...leaderboard.filter((e) => !e.eligible)].slice(0, 32);

  // Re-rank for group draw
  const rankedQualifiers = qualifiers.map((q, i) => ({
    ...q,
    rank: i + 1,
  }));

  // 2. Run group stage
  const groups = runGroupStage(rankedQualifiers, cupId);

  // 3. Extract qualified traders for R16
  const groupWinners: LeaderboardEntry[] = [];
  const runnersUp: LeaderboardEntry[] = [];

  for (const group of groups) {
    const winner = group.standings.find((s) => s.groupWinner);
    const runnerUp = group.standings.find(
      (s) => s.qualified && !s.groupWinner
    );
    if (winner) groupWinners.push(winner.entry);
    if (runnerUp) runnersUp.push(runnerUp.entry);
  }

  // 4. Build R16 matches (seeded pairing: winner vs runner-up)
  const usedTwists = twists ?? getDefaultTwists();
  const r16Twist = usedTwists.find((t) => t.round === "round-of-16");

  const roundOf16: KnockoutMatch[] = [];
  for (let i = 0; i < groupWinners.length && i < runnersUp.length; i++) {
    roundOf16.push(
      resolveKnockoutMatch(
        `r16-${roundOf16.length}`,
        `R16 Match ${roundOf16.length + 1}`,
        "round-of-16",
        groupWinners[i],
        runnersUp[runnersUp.length - 1 - i],
        r16Twist?.market
      )
    );
  }

  // 5. Quarter-finals
  const qfTwist = usedTwists.find((t) => t.round === "quarterfinal");
  const quarterFinals: KnockoutMatch[] = [];
  for (let i = 0; i < roundOf16.length; i += 2) {
    const left = roundOf16[i]?.winner;
    const right = roundOf16[i + 1]?.winner;
    quarterFinals.push(
      resolveKnockoutMatch(
        `qf-${quarterFinals.length}`,
        `QF ${quarterFinals.length + 1}`,
        "quarterfinal",
        left,
        right,
        qfTwist?.market
      )
    );
  }

  // 6. Semi-finals
  const sfTwist = usedTwists.find((t) => t.round === "semifinal");
  const semiFinals: KnockoutMatch[] = [];
  for (let i = 0; i < quarterFinals.length; i += 2) {
    const left = quarterFinals[i]?.winner;
    const right = quarterFinals[i + 1]?.winner;
    semiFinals.push(
      resolveKnockoutMatch(
        `sf-${semiFinals.length}`,
        `SF ${semiFinals.length + 1}`,
        "semifinal",
        left,
        right,
        sfTwist?.market
      )
    );
  }

  // 7. Final
  const final = resolveKnockoutMatch(
    "final",
    "Grand Final",
    "final",
    semiFinals[0]?.winner,
    semiFinals[1]?.winner
  );

  // 8. Third-place match
  const sfLosers = semiFinals.map((sf) => {
    if (!sf.winner || !sf.left || !sf.right) return undefined;
    return sf.winner.trader.id === sf.left.trader.id ? sf.right : sf.left;
  });

  const thirdPlace =
    sfLosers[0] && sfLosers[1]
      ? resolveKnockoutMatch(
          "third-place",
          "Third Place",
          "third-place",
          sfLosers[0],
          sfLosers[1]
        )
      : undefined;

  // 9. Redemption bracket — multi-round losers' bracket
  // Collect R16 losers and QF losers
  const r16Losers = roundOf16
    .map((m) => {
      if (!m.winner || !m.left || !m.right) return undefined;
      return m.winner.trader.id === m.left.trader.id ? m.right : m.left;
    })
    .filter(Boolean) as LeaderboardEntry[];

  const qfLosers = quarterFinals
    .map((qf) => {
      if (!qf.winner || !qf.left || !qf.right) return undefined;
      return qf.winner.trader.id === qf.left.trader.id ? qf.right : qf.left;
    })
    .filter(Boolean) as LeaderboardEntry[];

  // Round 1: Pair R16 losers
  const redemptionRound1: KnockoutMatch[] = [];
  for (let i = 0; i < r16Losers.length; i += 2) {
    if (r16Losers[i + 1]) {
      redemptionRound1.push(
        resolveKnockoutMatch(
          `redemption-r1-${redemptionRound1.length}`,
          `Redemption R1 Match ${redemptionRound1.length + 1}`,
          "redemption",
          r16Losers[i],
          r16Losers[i + 1]
        )
      );
    }
  }

  // Round 2: Pair R1 winners with QF losers
  const r1Winners = redemptionRound1
    .map((m) => m.winner)
    .filter(Boolean) as LeaderboardEntry[];

  // Interleave R1 winners and QF losers for balanced matchups
  const round2Entrants: LeaderboardEntry[] = [];
  const maxLen = Math.max(r1Winners.length, qfLosers.length);
  for (let i = 0; i < maxLen; i++) {
    if (i < qfLosers.length) round2Entrants.push(qfLosers[i]);
    if (i < r1Winners.length) round2Entrants.push(r1Winners[i]);
  }

  const redemptionRound2: KnockoutMatch[] = [];
  for (let i = 0; i < round2Entrants.length; i += 2) {
    if (round2Entrants[i + 1]) {
      redemptionRound2.push(
        resolveKnockoutMatch(
          `redemption-r2-${redemptionRound2.length}`,
          `Redemption R2 Match ${redemptionRound2.length + 1}`,
          "redemption",
          round2Entrants[i],
          round2Entrants[i + 1]
        )
      );
    }
  }

  // Redemption Final
  const r2Winners = redemptionRound2
    .map((m) => m.winner)
    .filter(Boolean) as LeaderboardEntry[];

  let redemptionFinal: KnockoutMatch | undefined;
  let redemptionWinner: LeaderboardEntry | undefined;

  if (r2Winners.length >= 2) {
    redemptionFinal = resolveKnockoutMatch(
      "redemption-final",
      "Redemption Final",
      "redemption",
      r2Winners[0],
      r2Winners[1]
    );
    redemptionWinner = redemptionFinal.winner;
  } else if (r2Winners.length === 1) {
    redemptionWinner = r2Winners[0];
  }

  const redemptionBracket = {
    round1: redemptionRound1,
    round2: redemptionRound2,
    redemptionFinal,
    redemptionWinner,
    prizePoolFraction: 0.05,
  };

  return {
    division: cupId,
    groups,
    roundOf16,
    quarterFinals,
    semiFinals,
    final,
    thirdPlace,
    redemptionBracket,
  };
}

// ── WC Seeding from Prop Challenges ──────────────────────────────────────────

export interface PropChallengeRecord {
  wallet: string;
  tier: string;
  passed: boolean;
  finalScore: number;
  completedAt: number; // unix timestamp
}

/**
 * Compute World Cup seeding from prop challenge history.
 *
 * Funded traders (Elite/Apex pass) get automatic qualification + top seeds.
 * Other traders are seeded by their best tournament score across recent challenges.
 *
 * @param records - Prop challenge results for all potential WC entrants
 * @param maxSeeds - Maximum number of seeded positions (default 8 per division)
 * @returns Ordered array of wallet addresses, index = seed (0 = top seed)
 */
export function computeWorldCupSeeding(
  records: PropChallengeRecord[],
  maxSeeds: number = 8
): string[] {
  // Funded traders: passed Elite or Apex
  const fundedTiers = new Set(["Elite", "Apex"]);
  const funded = records.filter(
    (r) => r.passed && fundedTiers.has(r.tier)
  );

  // Deduplicate by wallet, keep best score
  const bestByWallet = new Map<string, number>();
  for (const record of records) {
    if (!record.passed) continue;
    const existing = bestByWallet.get(record.wallet) ?? 0;
    if (record.finalScore > existing) {
      bestByWallet.set(record.wallet, record.finalScore);
    }
  }

  // Funded traders get priority seeding (sorted by score)
  const fundedWallets = new Set(funded.map((r) => r.wallet));
  const fundedSeeds = [...fundedWallets]
    .map((w) => ({ wallet: w, score: bestByWallet.get(w) ?? 0 }))
    .sort((a, b) => b.score - a.score)
    .slice(0, maxSeeds);

  // Fill remaining seeds with non-funded top performers
  const remainingSlots = maxSeeds - fundedSeeds.length;
  const nonFundedSeeds = [...bestByWallet.entries()]
    .filter(([wallet]) => !fundedWallets.has(wallet))
    .sort((a, b) => b[1] - a[1])
    .slice(0, remainingSlots)
    .map(([wallet]) => wallet);

  return [...fundedSeeds.map((s) => s.wallet), ...nonFundedSeeds];
}
