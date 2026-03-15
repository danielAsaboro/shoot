export type AssetClassId = "crypto" | "metals" | "energy" | "forex";

export type ScenarioId = "specialization" | "bubble" | "finals" | "integrity" | "group_stage";

export type ScoreWeights = {
  riskAdjustedPnl: number;
  consistency: number;
  missionProgress: number;
  streakPower: number;
  raffleBonus: number;
};

export type Guardrails = {
  minVolume: number;
  minTrades: number;
  maxSingleTradeShare: number;
};

export type TraderMetrics = {
  riskAdjustedPnl: number;
  consistency: number;
  missionProgress: number;
  streakPower: number;
  raffleBonus: number;
  weeklyVolume: number;
  tradeCount: number;
  maxSingleTradeShare: number;
  activeDays: number;
  streakDays: number;
  realizedPnl: number;
  drawdown: number;
  raffleTickets: number;
};

export type AbuseFlag = {
  code: string;
  label: string;
  severity: "low" | "medium" | "high";
  reason: string;
};

export type TraderRecord = {
  id: string;
  name: string;
  alias: string;
  specialization: AssetClassId;
  tag: string;
  bio: string;
  baseline: TraderMetrics;
  scenarioOverrides?: Partial<Record<ScenarioId, Partial<TraderMetrics>>>;
  manualFlags?: Partial<Record<ScenarioId, AbuseFlag[]>>;
};

export type Mission = {
  id: string;
  title: string;
  summary: string;
  points: number;
  tickets: number;
};

export type RewardTier = {
  label: string;
  range: string;
  payout: string;
  summary: string;
};

export type IntegrationNode = {
  system: string;
  role: string;
  implementation: string;
};

export type PilotStep = {
  title: string;
  summary: string;
};

export type PilotInsight = {
  quote: string;
  role: string;
  takeaway: string;
};

export type DeskDefinition = {
  id: string;
  cupId: AssetClassId;
  name: string;
  tier: "Premier" | "Challenger";
  motto: string;
  captainMission: string;
  supporters: number;
};

export type DeskStanding = {
  desk: DeskDefinition;
  score: number;
  averageScore: number;
  memberCount: number;
  memberAliases: string[];
  promotion: string;
  supporterBonus: number;
  topPerformer: string;
};

export type SimulationMetric = {
  label: string;
  baseline: number;
  projected: number;
  suffix: string;
  betterDirection: "higher" | "lower";
  summary: string;
};

export type SeasonSimulation = {
  headline: string;
  summary: string;
  metrics: SimulationMetric[];
};

export type TransferMove = {
  deskId: string;
  type: "Draft" | "Promotion" | "Loan";
  incoming: string;
  outgoing?: string;
  summary: string;
  impact: string;
};

export type FinalsMatch = {
  label: string;
  left?: LeaderboardEntry;
  right?: LeaderboardEntry;
  winner?: LeaderboardEntry;
  margin: number;
};

export type FinalsBracket = {
  semiFinals: FinalsMatch[];
  final: FinalsMatch;
};

export type ComparisonRow = {
  dimension: string;
  baseline: string;
  worldCup: string;
  whyItMatters: string;
};

export type RolloutMilestone = {
  phase: string;
  duration: string;
  goal: string;
  outputs: string;
};

export type JudgeProofPoint = {
  title: string;
  summary: string;
};

export type CompetitionPreset = {
  id: string;
  label: string;
  summary: string;
  cupId: AssetClassId;
  scenarioId: ScenarioId;
  weights: ScoreWeights;
  guardrails: Guardrails;
};

export type PayoutPreviewRow = {
  rank: string;
  recipient: string;
  payout: string;
  status: string;
  reason: string;
};

export type CupDefinition = {
  id: AssetClassId;
  name: string;
  badge: string;
  strapline: string;
  narrative: string;
  finalsSlots: number;
  markets: string[];
  missions: Mission[];
  rewards: RewardTier[];
};

export type ScenarioDefinition = {
  id: ScenarioId;
  label: string;
  phase: string;
  summary: string;
};

export type LeaderboardEntry = {
  trader: TraderRecord;
  metrics: TraderMetrics;
  score: number;
  eligible: boolean;
  flags: AbuseFlag[];
  qualification: string;
  reward: RewardTier;
  rank: number;
};

export const defaultWeights: ScoreWeights = {
  riskAdjustedPnl: 50,
  consistency: 20,
  missionProgress: 15,
  streakPower: 10,
  raffleBonus: 5,
};

export const defaultGuardrails: Guardrails = {
  minVolume: 75000,
  minTrades: 14,
  maxSingleTradeShare: 45,
};

// ── Group Stage Types ──────────────────────────────────────────────────────────

export type GroupId = string; // e.g. "crypto-A", "metals-H"

export type GroupMatchResult = "win" | "loss" | "draw";

export type GroupMatch = {
  groupId: GroupId;
  division: AssetClassId;
  traderA: TraderRecord;
  traderB: TraderRecord;
  raroiA: number;
  raroiB: number;
  result: GroupMatchResult;
  matchWindow: string;
  matchday: number;
};

export type GroupStanding = {
  trader: TraderRecord;
  entry: LeaderboardEntry;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  points: number;
  raroiFor: number;
  raroiAgainst: number;
  raroiDifference: number;
  totalVolume: number;
  headToHeadRecord: Record<string, GroupMatchResult>;
  qualified: boolean;
  groupWinner: boolean;
};

export type Group = {
  id: GroupId;
  label: string;
  division: AssetClassId;
  traders: LeaderboardEntry[];
  matches: GroupMatch[];
  standings: GroupStanding[];
  isGroupOfDeath: boolean;
  seedStrength: number;
};

// ── Knockout Types ─────────────────────────────────────────────────────────────

export type KnockoutRound =
  | "round-of-16"
  | "quarterfinal"
  | "semifinal"
  | "final"
  | "third-place"
  | "redemption";

export type KnockoutMatch = FinalsMatch & {
  id: string;
  round: KnockoutRound;
  twistMarket?: string;
};

export type RedemptionBracket = {
  /** Round 1: R16 losers paired (up to 4 matches). */
  round1: KnockoutMatch[];
  /** Round 2: R1 winners paired with QF losers. */
  round2: KnockoutMatch[];
  /** Redemption final: determines the redemption champion. */
  redemptionFinal?: KnockoutMatch;
  /** Winner of the redemption bracket. */
  redemptionWinner?: LeaderboardEntry;
  /** Fraction of total prize pool allocated to redemption (e.g. 0.05 = 5%). */
  prizePoolFraction: number;
};

export type GroupStageBracket = {
  division: AssetClassId;
  groups: Group[];
  roundOf16: KnockoutMatch[];
  quarterFinals: KnockoutMatch[];
  semiFinals: KnockoutMatch[];
  final: KnockoutMatch;
  thirdPlace?: KnockoutMatch;
  redemptionBracket: RedemptionBracket;
};

// ── Wild Features ──────────────────────────────────────────────────────────────

export type GoldenTrade = {
  traderId: string;
  alias: string;
  market: string;
  direction: "long" | "short";
  pnlUsd: number;
  pnlPercent: number;
  leverage: number;
  timestamp: number;
  matchContext: string;
};

export type LiveOdds = {
  matchId: string;
  leftWinProb: number;
  rightWinProb: number;
  drawProb: number;
  trendDirection: "gaining" | "losing" | "stable";
};

export type CrowdVote = {
  matchId: string;
  totalVotes: number;
  isFeatured: boolean;
  bonusPrizePool?: number;
};

export type Rivalry = {
  walletA: string;
  walletB: string;
  headToHead: { wins: number; losses: number; draws: number };
  totalMeetings: number;
  lastSeason: string;
  narrativeTag: string;
};

export type NarrativeSeverity = "normal" | "hype" | "legendary";

export type NarrativeBeat = {
  type: string;
  headline: string;
  subtext: string;
  timestamp: number;
  severity: NarrativeSeverity;
};

export type MarketTwist = {
  round: KnockoutRound;
  market: string;
  label: string;
  description: string;
  announcedAt: number;
};

// ── Power-ups ─────────────────────────────────────────────────────────────────

export type PowerUpType = "mulligan" | "double_points" | "market_swap" | "overtime_shield";

export type PowerUp = {
  type: PowerUpType;
  label: string;
  description: string;
  /** Which knockout round this power-up can be activated in */
  eligibleRounds: KnockoutRound[];
};

export type ActivatedPowerUp = {
  type: PowerUpType;
  wallet: string;
  matchId: string;
  activatedAt: number;
  /** Whether the power-up has been consumed (one-time use) */
  consumed: boolean;
};

export const POWER_UP_CATALOG: PowerUp[] = [
  {
    type: "mulligan",
    label: "Mulligan",
    description: "Cancel your worst single trade from this match's scoring window. The trade's P&L and volume are excluded from RAROI computation.",
    eligibleRounds: ["round-of-16", "quarterfinal", "semifinal"],
  },
  {
    type: "double_points",
    label: "Double Points",
    description: "2x scoring multiplier on all trades for a 24-hour window within the match. Must be activated before the midpoint.",
    eligibleRounds: ["round-of-16", "quarterfinal"],
  },
  {
    type: "market_swap",
    label: "Market Swap",
    description: "Switch your division's required market to any other market in the same asset class. Lasts for the remainder of the match.",
    eligibleRounds: ["quarterfinal", "semifinal"],
  },
  {
    type: "overtime_shield",
    label: "Overtime Shield",
    description: "If the match is within 5% score differential at expiry, extend it by 12 hours. Both traders continue trading.",
    eligibleRounds: ["semifinal", "final"],
  },
];

// ── Knockout Buy-in ────────────────────────────────────────────────────────────

/** Knockout buy-in fee in USDC. Traders advancing to knockout pay this per division. */
export const KNOCKOUT_BUYIN_USDC = 10;

/** Funded Traders skip the knockout buy-in (incentive for Prop Challenge progression). */
export const FUNDED_TRADER_BUYIN_EXEMPT = true;

