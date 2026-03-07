export {
  type AbuseFlagCode,
  type AbuseFlagDetail,
  type CompetitionState,
  type FundedStatus,
  type QuestProgress,
  type StreakState,
  toAbuseFlagCode,
} from "../shared/types.ts";

import {
  type AbuseFlagCode,
  type CompetitionState,
  type FundedStatus,
  type QuestProgress,
  type StreakState,
} from "../shared/types.ts";
export type AbuseFlag = AbuseFlagCode;

export interface ChallengePreset {
  id: string;
  name: string;
  focus: string;
  tagline: string;
  questRewardPoints: number;
  streakMultiplier: number;
  raffleTickets: number;
}

export type ChallengeTierId = "sprint" | "scout" | "ranger" | "veteran" | "elite" | "apex";

export interface ChallengeTier {
  id: ChallengeTierId;
  name: string;
  entryFee: number;
  profitTarget: number;
  maxDrawdown: number;
  dailyLossLimit: number;
  durationDays: number;
  fundedEligible: boolean;
  retryDiscount: number;
  /** Minimum capital requirement for this tier (USD). */
  minCapital: number;
  /** If set, only trades on these markets are accepted for this challenge. */
  allowedMarkets?: string[];
}

export type SpecialistType = "crypto" | "metals" | "energy" | "forex" | "multi_asset";

export interface SpecialistChallenge {
  type: SpecialistType;
  name: string;
  markets: string[];
  bonusMultiplier: number;
  launchPhase: number;
}

export interface CompetitionConfig {
  seasonId: string;
  cohortDurationHours: number;
  participantCap: number;
  entryFeeUsd: number;
  scoringWeights: {
    pnlPercent: number;
    volumeUsd: number;
    consistency: number;
    winRate: number;
    drawdownPenalty: number;
  };
  prizePoolSplit: number[];
  fundedRewardShareBps: number;
  presets: ChallengePreset[];
  /** Minimum number of trades required for eligibility. Default: 5. */
  minTrades?: number;
  /** Minimum active trading days required. Default: 2 for 72h, 3 for 7-day. */
  minActiveDays?: number;
  /** Scoring mode for tournament ranking. Default: "standard". */
  scoringMode?: ScoringMode;
}

export interface TraderPerformance {
  pnlPercent: number;
  volumeUsd: number;
  winRate: number;
  consistencyScore: number;
  maxDrawdownPercent: number;
  attainedAt: string;
  /** Number of trades executed during the cohort window. */
  tradeCount?: number;
  /** Number of distinct active trading days (UTC). */
  activeDays?: number;
}

export interface TraderCompetitionProfile {
  wallet: string;
  displayName: string;
  badge: string;
  performance: TraderPerformance;
  seasonPoints: number;
  fundedStatus: FundedStatus;
  questProgress: QuestProgress[];
  streakDays: number;
  streakState: StreakState;
  raffleTickets: number;
  abuseFlags: AbuseFlag[];
}

export interface CompetitionCohortSeed {
  id: string;
  name: string;
  presetId: string;
  state: CompetitionState;
  startTime: string;
  endTime: string;
  narrative: string;
  rewardPoolUsd: number;
  entryFeeUsd: number;
  participantCap: number;
  traders: TraderCompetitionProfile[];
  /** Scoring mode override for this cohort. */
  scoringMode?: ScoringMode;
}

export interface MutagenScoreSummary {
  /** Total Mutagen earned across all trades in the competition window. */
  totalMutagen: number;
  /** Number of trades contributing to the Mutagen score. */
  tradeCount: number;
}

export interface StandingsEntry {
  wallet: string;
  displayName: string;
  badge: string;
  rank: number;
  tournamentScore: number;
  pnlPercent: number;
  volumeUsd: number;
  winRate: number;
  consistencyScore: number;
  maxDrawdownPercent: number;
  attainedAt: string;
  eligible: boolean;
  disqualificationReason?: string;
  questRewardPoints: number;
  raffleTicketsAwarded: number;
  tradeCount?: number;
  activeDays?: number;
  fundedProfile?: FundedTraderProfile;
  /** Mutagen score (Adrena-native scoring). Present when live data is available. */
  mutagenScore?: MutagenScoreSummary;
}

export interface RewardPreview {
  wallet: string;
  displayName: string;
  rank: number;
  payoutUsd: number;
  fundedStatus: FundedStatus;
  revenueShareBps: number;
}

export interface AbusePolicyResult {
  wallet: string;
  displayName: string;
  flags: AbuseFlag[];
  eligible: boolean;
  reason?: string;
}

export interface CompetitionCohortView {
  id: string;
  name: string;
  preset: ChallengePreset;
  state: CompetitionState;
  startTime: string;
  endTime: string;
  narrative: string;
  rewardPoolUsd: number;
  entryFeeUsd: number;
  participantCap: number;
  enrolledCount: number;
  standings: StandingsEntry[];
  rewardPreview: RewardPreview[];
  abuseResults: AbusePolicyResult[];
  matchups?: HeadToHeadMatch[];
  pnlRace?: LivePnlRace;
  deskStandings?: DeskStanding[];
  activeRiskEvents?: RiskEvent[];
  commentaryFeed?: CommentaryFeed;
}

export interface SeasonSummary {
  seasonId: string;
  title: string;
  volumeSharePercent: number;
  cohortsRunning: number;
  paidEntries: number;
  totalPrizePoolUsd: number;
}

export interface ViewerCompetitionState {
  wallet: string;
  displayName: string;
  connected: boolean;
  enrolledCohortId: string | null;
  fundedStatus: FundedStatus;
  seasonPoints: number;
  rewardPreview: RewardPreview | null;
  questProgress: QuestProgress[];
  streakDays: number;
  streakState: StreakState;
  raffleTickets: number;
}

export interface CompetitionSnapshot {
  config: CompetitionConfig;
  season: SeasonSummary;
  cohorts: CompetitionCohortView[];
  viewer: ViewerCompetitionState;
}

export interface CompetitionEnrollmentInput {
  cohortId: string;
  wallet: string;
  txSignature?: string;
}

export interface CompetitionDataAdapter {
  getSnapshot(
    viewerWallet?: string,
    enrolledCohortId?: string | null
  ): CompetitionSnapshot;
  enrollTrader(input: CompetitionEnrollmentInput): CompetitionSnapshot;
  getRewardPreview(
    cohortId: string,
    viewerWallet?: string,
    enrolledCohortId?: string | null
  ): RewardPreview | null;
}

export interface AdrenaEngagementAdapter {
  applyQuestRewards(cohortId: string, wallet: string): QuestProgress[];
  updateStreak(
    cohortId: string,
    wallet: string
  ): {
    streakDays: number;
    streakState: StreakState;
  };
  issueRaffleTickets(cohortId: string, wallet: string): number;
  exportLeaderboardDelta(cohortId: string): Array<{
    wallet: string;
    rank: number;
    seasonPoints: number;
  }>;
}

export interface ScoreBreakdown {
  pnlContribution: number;
  volumeContribution: number;
  consistencyContribution: number;
  winRateContribution: number;
  drawdownPenalty: number;
  totalScore: number;
}

export interface CompetitionProjectionInput {
  pnlPercent: number;
  volumeUsd: number;
  winRate: number;
  consistencyScore: number;
  maxDrawdownPercent: number;
}

export interface CompetitionProjectionResult {
  cohortId: string;
  entry: StandingsEntry;
  rewardPreview: RewardPreview | null;
  scoreBreakdown: ScoreBreakdown;
  placementDelta: number;
}

export type ScoringMode = "standard" | "raroi";

export type CompetitionIntegrationMode = "adrena";

export interface CompetitionIntegrationStatus {
  apiBaseUrl?: string;
  configured: boolean;
  detail: string;
  label: string;
  provider: CompetitionIntegrationMode;
}

export interface CompetitionSnapshotResponse {
  integration: CompetitionIntegrationStatus;
  snapshot: CompetitionSnapshot;
}

export interface CompetitionEntryReceipt {
  cohortId: string;
  createdAt: string;
  lamports: number;
  signature: string;
  wallet: string;
}

// ── Risk Events (Sprint 1) ──────────────────────────────────────────────────

export type RiskEventId =
  | "flash_crash"
  | "liquidity_drain"
  | "volatility_spike"
  | "forced_market"
  | "correlation_break"
  | "news_blackout"
  | "leverage_cap"
  | "spread_widening";

export type RiskEventSeverity = "mild" | "moderate" | "severe";

export interface RiskEvent {
  id: RiskEventId;
  label: string;
  description: string;
  severity: RiskEventSeverity;
  affectedMetric: keyof TraderPerformance;
  modifier: number;
  affectedTiers: ChallengeTierId[];
  durationHours: number;
  triggeredAt: string;
}

export interface RiskScenario {
  id: string;
  label: string;
  events: RiskEvent[];
  narrative: string;
  difficulty: number;
}

export interface ChallengeModifier {
  type: string;
  value: number;
  reason: string;
}

// ── Competitive (Sprint 2) ──────────────────────────────────────────────────

export type HeadToHeadStatus = "scheduled" | "live" | "completed";

export interface HeadToHeadMatch {
  id: string;
  cohortId: string;
  traderA: string;
  traderB: string;
  window: { start: string; end: string };
  status: HeadToHeadStatus;
  result?: MatchupResult;
}

export interface MatchupResult {
  winnerId: string;
  loserId: string;
  marginPnl: number;
  marginScore: number;
  isDraw: boolean;
  riskEventActive?: RiskEventId;
  goldenTrade?: PropGoldenTrade;
}

export type PnlMomentum = "surging" | "stable" | "fading";

export interface LivePnlRaceEntry {
  wallet: string;
  displayName: string;
  pnl: number;
  score: number;
  momentum: PnlMomentum;
  rankDelta: number;
}

export interface LivePnlRace {
  cohortId: string;
  timestamp: string;
  entries: LivePnlRaceEntry[];
}

export type DeskTier = "Premier" | "Challenger";

export interface DeskTeam {
  id: string;
  name: string;
  motto: string;
  tierId: ChallengeTierId;
  specialistType?: SpecialistType;
  members: string[];
  captainWallet: string;
  supporters: number;
}

export interface DeskStanding {
  desk: DeskTeam;
  averageScore: number;
  averagePnl: number;
  totalVolume: number;
  deskScore: number;
  promotion: "promoted" | "relegated" | "stable";
}

// ── Funded Progression (Sprint 3) ───────────────────────────────────────────

export type FundedDeskLevel = "watchlist" | "funded" | "senior_funded" | "captain" | "partner";

export interface FundedDeskConfig {
  level: FundedDeskLevel;
  label: string;
  pointsThreshold: number;
  minFinish: number;
  minConsecutiveWeeks: number;
  revenueShareBps: number;
  perks: string[];
}

export interface FundedTraderProfile {
  wallet: string;
  currentLevel: FundedDeskLevel;
  seasonPoints: number;
  consecutiveEligibleWeeks: number;
  bestFinish: number;
  promotionProgress: number;
  history: FundedLevelTransition[];
}

export interface FundedLevelTransition {
  from: FundedDeskLevel | "none";
  to: FundedDeskLevel;
  reason: string;
  timestamp: string;
}

// ── Social & Narrative (Sprint 4) ───────────────────────────────────────────

export type PropNarrativeBeatType =
  | "rank-surge"
  | "drawdown-recovery"
  | "risk-event-survivor"
  | "funded-promotion"
  | "desk-rivalry"
  | "golden-trade"
  | "perfect-record"
  | "upset"
  | "streak-milestone"
  | "archetype-reveal"
  | "match-summary"
  | "storyline"
  | "closing-gap"
  | "crowd-favorite";

export type PropNarrativeSeverity = "normal" | "hype" | "legendary";

export interface PropNarrativeBeat {
  type: PropNarrativeBeatType;
  headline: string;
  subtext: string;
  timestamp: number;
  severity: PropNarrativeSeverity;
  cohortId: string;
}

export interface PropGoldenTrade {
  traderId: string;
  displayName: string;
  market: string;
  direction: "long" | "short";
  pnlUsd: number;
  pnlPercent: number;
  leverage: number;
  cohortContext: string;
}

export interface PropRivalry {
  walletA: string;
  walletB: string;
  meetings: number;
  aWins: number;
  bWins: number;
  draws: number;
  narrativeTag: string;
  intensity: number;
}

export interface SpectatorVote {
  matchId: string;
  voterWallet: string;
  votedFor: string;
  timestamp: number;
}

export interface CrowdFavorite {
  matchId: string;
  totalVotes: number;
  leadingTrader: string;
  isFeatured: boolean;
}

export interface CommentaryFeed {
  cohortId: string;
  beats: PropNarrativeBeat[];
  goldenTrade: PropGoldenTrade | null;
  crowdFavorites: CrowdFavorite[];
  rivalries: PropRivalry[];
  riskEvents: RiskEvent[];
}

export interface AdrenaUpstreamReward {
  display_name: string;
  funded_status: FundedStatus;
  payout_usd: number;
  rank: number;
  revenue_share_bps: number;
  wallet: string;
}

export interface AdrenaUpstreamAbuseResult {
  display_name: string;
  eligible: boolean;
  flags: AbuseFlag[];
  reason?: string;
  wallet: string;
}

export interface AdrenaUpstreamStandingsEntry {
  attained_at: string;
  badge: string;
  consistency_score: number;
  display_name: string;
  disqualification_reason?: string;
  eligible: boolean;
  max_drawdown_percent: number;
  pnl_percent: number;
  quest_reward_points: number;
  raffle_tickets_awarded: number;
  rank: number;
  tournament_score: number;
  volume_usd: number;
  wallet: string;
  win_rate: number;
}

export interface AdrenaUpstreamPreset {
  focus: string;
  id: string;
  name: string;
  quest_reward_points: number;
  raffle_tickets: number;
  streak_multiplier: number;
  tagline: string;
}

export interface AdrenaUpstreamCohort {
  abuse_results: AdrenaUpstreamAbuseResult[];
  end_time: string;
  enrolled_count: number;
  entry_fee_usd: number;
  id: string;
  name: string;
  narrative: string;
  participant_cap: number;
  preset: AdrenaUpstreamPreset;
  reward_pool_usd: number;
  reward_preview: AdrenaUpstreamReward[];
  standings: AdrenaUpstreamStandingsEntry[];
  start_time: string;
  state: CompetitionState;
}

export interface AdrenaUpstreamViewerState {
  connected: boolean;
  display_name: string;
  enrolled_cohort_id: string | null;
  funded_status: FundedStatus;
  quest_progress: Array<{
    label: string;
    progress: number;
    target: number;
  }>;
  raffle_tickets: number;
  reward_preview: AdrenaUpstreamReward | null;
  season_points: number;
  streak_days: number;
  streak_state: StreakState;
  wallet: string;
}

export interface AdrenaUpstreamSeason {
  cohorts_running: number;
  paid_entries: number;
  season_id: string;
  title: string;
  total_prize_pool_usd: number;
  volume_share_percent: number;
}

export interface AdrenaUpstreamConfig {
  cohort_duration_hours: number;
  entry_fee_usd: number;
  funded_reward_share_bps: number;
  participant_cap: number;
  presets: AdrenaUpstreamPreset[];
  prize_pool_split: number[];
  scoring_weights: {
    consistency: number;
    drawdown_penalty: number;
    pnl_percent: number;
    volume_usd: number;
    win_rate: number;
  };
  season_id: string;
}

export interface AdrenaUpstreamSnapshotPayload {
  config: AdrenaUpstreamConfig;
  cohorts: AdrenaUpstreamCohort[];
  meta: {
    generated_at: string;
    schema_version: "adrena-competition-snapshot-v1";
    source: string;
  };
  season: AdrenaUpstreamSeason;
  viewer: AdrenaUpstreamViewerState;
}
