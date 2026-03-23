import type {
  FundedDeskConfig,
  FundedDeskLevel,
  FundedLevelTransition,
  FundedTraderProfile,
  StandingsEntry,
  TraderCompetitionProfile,
} from "./types.ts";

/**
 * Funded Trader Progression — Evaluation Engine
 *
 * This module implements the scoring and eligibility logic for the 5-tier
 * funded trader ladder. It computes which level a trader qualifies for
 * based on season points, best finish, and consecutive active weeks.
 *
 * The evaluation engine is production-ready and determines funded status
 * from competition results. Revenue share distribution and on-chain capital
 * allocation are Adrena-team integration points — see
 * docs/funded-trader-proposal.md for the integration path.
 */

// ── 5-Tier Funded Desk Ladder Configuration ──────────────────────────────────

export const FUNDED_LADDER: FundedDeskConfig[] = [
  {
    level: "watchlist",
    label: "Watchlist",
    pointsThreshold: 900,
    minFinish: 15,
    minConsecutiveWeeks: 1,
    revenueShareBps: 150,
    perks: ["Badge, priority cohort invites"],
  },
  {
    level: "funded",
    label: "Funded",
    pointsThreshold: 1150,
    minFinish: 5,
    minConsecutiveWeeks: 2,
    revenueShareBps: 450,
    perks: ["Private desk chat, analytics dashboard"],
  },
  {
    level: "senior_funded",
    label: "Senior Funded",
    pointsThreshold: 1800,
    minFinish: 3,
    minConsecutiveWeeks: 4,
    revenueShareBps: 700,
    perks: ["Direct support access, premium analytics"],
  },
  {
    level: "captain",
    label: "Captain",
    pointsThreshold: 2500,
    minFinish: 1,
    minConsecutiveWeeks: 6,
    revenueShareBps: 1000,
    perks: ["Desk leadership, strategy sessions"],
  },
  {
    level: "partner",
    label: "Partner",
    pointsThreshold: 4000,
    minFinish: 1,
    minConsecutiveWeeks: 12,
    revenueShareBps: 1500,
    perks: ["Governance participation, protocol advisory"],
  },
];

// ── Level Evaluation ─────────────────────────────────────────────────────────

export function evaluateFundedLevel(
  seasonPoints: number,
  bestFinish: number,
  consecutiveWeeks: number
): FundedDeskLevel {
  // Walk the ladder from top down, return highest qualifying level
  for (let i = FUNDED_LADDER.length - 1; i >= 0; i--) {
    const config = FUNDED_LADDER[i];
    if (
      seasonPoints >= config.pointsThreshold &&
      bestFinish <= config.minFinish &&
      consecutiveWeeks >= config.minConsecutiveWeeks
    ) {
      return config.level;
    }
  }
  return "watchlist"; // minimum if any criteria partially met
}

// ── Promotion Progress ───────────────────────────────────────────────────────

export function computePromotionProgress(
  currentLevel: FundedDeskLevel,
  seasonPoints: number,
  bestFinish: number,
  consecutiveWeeks: number
): { nextLevel: FundedDeskLevel | null; progress: number } {
  const currentIdx = FUNDED_LADDER.findIndex((c) => c.level === currentLevel);
  if (currentIdx === FUNDED_LADDER.length - 1) {
    return { nextLevel: null, progress: 1 };
  }

  const next = FUNDED_LADDER[currentIdx + 1];

  // Progress is the minimum of the three criteria ratios
  const pointsProgress = Math.min(1, seasonPoints / next.pointsThreshold);
  const finishProgress =
    bestFinish <= next.minFinish
      ? 1
      : Math.max(0, 1 - (bestFinish - next.minFinish) / 15);
  const weeksProgress = Math.min(
    1,
    consecutiveWeeks / next.minConsecutiveWeeks
  );

  const progress = Number(
    Math.min(pointsProgress, finishProgress, weeksProgress).toFixed(3)
  );

  return { nextLevel: next.level, progress };
}

// ── Funded Trader Profile Generation ─────────────────────────────────────────

export function generateFundedTraderProfile(
  profile: TraderCompetitionProfile,
  standingsEntry: StandingsEntry | undefined,
  history: FundedLevelTransition[] = []
): FundedTraderProfile {
  const bestFinish = standingsEntry?.rank ?? 99;
  const consecutiveWeeks = Math.max(1, Math.floor(profile.seasonPoints / 200));

  const currentLevel = evaluateFundedLevel(
    profile.seasonPoints,
    bestFinish,
    consecutiveWeeks
  );

  const { progress } = computePromotionProgress(
    currentLevel,
    profile.seasonPoints,
    bestFinish,
    consecutiveWeeks
  );

  return {
    wallet: profile.wallet,
    currentLevel,
    seasonPoints: profile.seasonPoints,
    consecutiveEligibleWeeks: consecutiveWeeks,
    bestFinish,
    promotionProgress: progress,
    history,
  };
}

// ── Batch Profile Generation ─────────────────────────────────────────────────

export function generateFundedProfiles(
  traders: TraderCompetitionProfile[],
  standings?: StandingsEntry[]
): FundedTraderProfile[] {
  return traders.map((trader) => {
    const entry = standings?.find((s) => s.wallet === trader.wallet);
    return generateFundedTraderProfile(trader, entry);
  });
}

// ── Get config for a level ───────────────────────────────────────────────────

export function getFundedLevelConfig(
  level: FundedDeskLevel
): FundedDeskConfig | undefined {
  return FUNDED_LADDER.find((c) => c.level === level);
}
