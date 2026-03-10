import type {
  AbusePolicyResult,
  CompetitionConfig,
  CompetitionCohortView,
  CompetitionSnapshot,
  FundedStatus,
  RewardPreview,
  StandingsEntry,
  StreakState,
} from "./types.ts";

export interface AdrenaCompetitionPresetSource {
  focus: string;
  id: string;
  name: string;
  questRewardPoints: number;
  raffleTickets: number;
  streakMultiplier: number;
  tagline: string;
}

export interface AdrenaCompetitionConfigSource {
  cohortDurationHours: number;
  entryFeeUsd: number;
  fundedRewardShareBps: number;
  participantCap: number;
  presets: AdrenaCompetitionPresetSource[];
  prizePoolSplit: number[];
  scoringWeights: CompetitionConfig["scoringWeights"];
  seasonId: string;
}

export interface AdrenaSeasonSource {
  cohortsRunning: number;
  paidEntries: number;
  seasonId: string;
  title: string;
  totalPrizePoolUsd: number;
  volumeSharePercent: number;
}

export interface AdrenaCohortSource {
  endTime: string;
  entryFeeUsd: number;
  id: string;
  name: string;
  narrative: string;
  participantCap: number;
  presetId: string;
  rewardPoolUsd: number;
  startTime: string;
  state: CompetitionCohortView["state"];
}

export interface AdrenaLeaderboardRowSource {
  attainedAt: string;
  badge: string;
  consistencyScore: number;
  displayName: string;
  maxDrawdownPercent: number;
  pnlPercent: number;
  questRewardPoints: number;
  raffleTicketsAwarded: number;
  rank: number;
  tournamentScore: number;
  volumeUsd: number;
  wallet: string;
  winRate: number;
  tradeCount: number;
  activeDays: number;
  mutagenTotal?: number;
  mutagenTradeCount?: number;
}

export interface AdrenaAbuseReviewSource {
  cohortId: string;
  displayName: string;
  flags: AbusePolicyResult["flags"];
  reason?: string;
  wallet: string;
}

export interface AdrenaQuestProgressSource {
  label: string;
  progress: number;
  target: number;
}

export interface AdrenaViewerSource {
  connected: boolean;
  displayName: string;
  enrolledCohortId: string | null;
  fundedStatus: FundedStatus;
  questProgress: AdrenaQuestProgressSource[];
  raffleTickets: number;
  seasonPoints: number;
  streakDays: number;
  streakState: StreakState;
  wallet: string;
}

export interface AdrenaSourceSnapshotInput {
  abuseReviewsByCohort: Record<string, AdrenaAbuseReviewSource[]>;
  config: AdrenaCompetitionConfigSource;
  cohorts: AdrenaCohortSource[];
  leaderboardByCohort: Record<string, AdrenaLeaderboardRowSource[]>;
  season: AdrenaSeasonSource;
  viewer: AdrenaViewerSource;
}

function buildRewardPreview(
  standings: StandingsEntry[],
  config: AdrenaCompetitionConfigSource,
  rewardPoolUsd: number
): RewardPreview[] {
  return standings
    .filter((entry) => entry.eligible)
    .slice(0, config.prizePoolSplit.length)
    .map((entry, index) => ({
      displayName: entry.displayName,
      fundedStatus: index < 2 ? "qualified" : index < 5 ? "watchlist" : "none",
      payoutUsd: Number(
        (rewardPoolUsd * config.prizePoolSplit[index]).toFixed(2)
      ),
      rank: entry.rank,
      revenueShareBps:
        index < 2 ? config.fundedRewardShareBps : index < 5 ? 150 : 0,
      wallet: entry.wallet,
    }));
}

export function buildCompetitionSnapshotFromSources(
  input: AdrenaSourceSnapshotInput
): CompetitionSnapshot {
  const config: CompetitionConfig = {
    cohortDurationHours: input.config.cohortDurationHours,
    entryFeeUsd: input.config.entryFeeUsd,
    fundedRewardShareBps: input.config.fundedRewardShareBps,
    participantCap: input.config.participantCap,
    presets: input.config.presets,
    prizePoolSplit: input.config.prizePoolSplit,
    scoringWeights: input.config.scoringWeights,
    seasonId: input.config.seasonId,
  };

  const cohorts = input.cohorts.map((cohort) => {
    const preset = config.presets.find((item) => item.id === cohort.presetId);
    if (!preset) {
      throw new Error(
        `Missing preset ${cohort.presetId} for cohort ${cohort.id}.`
      );
    }

    const abuseResults: AbusePolicyResult[] = (
      input.abuseReviewsByCohort[cohort.id] ?? []
    ).map((review) => ({
      displayName: review.displayName,
      eligible: false,
      flags: review.flags,
      reason: review.reason,
      wallet: review.wallet,
    }));

    const abuseByWallet = new Map(
      abuseResults.map((item) => [item.wallet, item])
    );
    const standings: StandingsEntry[] = (
      input.leaderboardByCohort[cohort.id] ?? []
    ).map((row) => {
      const abuse = abuseByWallet.get(row.wallet);
      return {
        attainedAt: row.attainedAt,
        badge: row.badge,
        consistencyScore: row.consistencyScore,
        displayName: row.displayName,
        disqualificationReason: abuse?.reason,
        eligible: !abuse,
        maxDrawdownPercent: row.maxDrawdownPercent,
        pnlPercent: row.pnlPercent,
        questRewardPoints: row.questRewardPoints,
        raffleTicketsAwarded: row.raffleTicketsAwarded,
        rank: row.rank,
        tournamentScore: row.tournamentScore,
        volumeUsd: row.volumeUsd,
        wallet: row.wallet,
        winRate: row.winRate,
        tradeCount: row.tradeCount,
        activeDays: row.activeDays,
        mutagenScore: row.mutagenTotal != null
          ? { totalMutagen: row.mutagenTotal, tradeCount: row.mutagenTradeCount ?? row.tradeCount }
          : undefined,
      };
    });

    return {
      abuseResults,
      endTime: cohort.endTime,
      enrolledCount: standings.length,
      entryFeeUsd: cohort.entryFeeUsd,
      id: cohort.id,
      name: cohort.name,
      narrative: cohort.narrative,
      participantCap: cohort.participantCap,
      preset,
      rewardPoolUsd: cohort.rewardPoolUsd,
      rewardPreview: buildRewardPreview(
        standings,
        input.config,
        cohort.rewardPoolUsd
      ),
      standings,
      startTime: cohort.startTime,
      state: cohort.state,
    };
  });

  const selectedRewardPreview = input.viewer.enrolledCohortId
    ? (cohorts
        .find((cohort) => cohort.id === input.viewer.enrolledCohortId)
        ?.rewardPreview.find((entry) => entry.wallet === input.viewer.wallet) ??
      null)
    : null;

  return {
    config,
    cohorts,
    season: input.season,
    viewer: {
      connected: input.viewer.connected,
      displayName: input.viewer.displayName,
      enrolledCohortId: input.viewer.enrolledCohortId,
      fundedStatus:
        selectedRewardPreview?.fundedStatus ?? input.viewer.fundedStatus,
      questProgress: input.viewer.questProgress,
      raffleTickets: input.viewer.raffleTickets,
      rewardPreview: selectedRewardPreview,
      seasonPoints: input.viewer.seasonPoints,
      streakDays: input.viewer.streakDays,
      streakState: input.viewer.streakState,
      wallet: input.viewer.wallet,
    },
  };
}
