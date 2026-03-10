import type {
  AbusePolicyResult,
  AdrenaUpstreamAbuseResult,
  AdrenaUpstreamCohort,
  AdrenaUpstreamConfig,
  AdrenaUpstreamPreset,
  AdrenaUpstreamReward,
  AdrenaUpstreamSnapshotPayload,
  AdrenaUpstreamStandingsEntry,
  AdrenaUpstreamViewerState,
  CompetitionConfig,
  CompetitionCohortView,
  CompetitionSnapshot,
  RewardPreview,
  SeasonSummary,
  StandingsEntry,
  ViewerCompetitionState,
} from "./types.ts";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function assertString(value: unknown, field: string): string {
  if (typeof value !== "string") {
    throw new Error(`Invalid Adrena payload: ${field} must be a string.`);
  }

  return value;
}

function assertNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    throw new Error(`Invalid Adrena payload: ${field} must be a number.`);
  }

  return value;
}

function assertBoolean(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`Invalid Adrena payload: ${field} must be a boolean.`);
  }

  return value;
}

function assertArray(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`Invalid Adrena payload: ${field} must be an array.`);
  }

  return value;
}

function normalizeReward(value: unknown): RewardPreview {
  if (!isRecord(value)) {
    throw new Error("Invalid Adrena payload: reward entry must be an object.");
  }

  return {
    displayName: assertString(value.display_name, "reward.display_name"),
    fundedStatus: assertString(
      value.funded_status,
      "reward.funded_status"
    ) as RewardPreview["fundedStatus"],
    payoutUsd: assertNumber(value.payout_usd, "reward.payout_usd"),
    rank: assertNumber(value.rank, "reward.rank"),
    revenueShareBps: assertNumber(
      value.revenue_share_bps,
      "reward.revenue_share_bps"
    ),
    wallet: assertString(value.wallet, "reward.wallet"),
  };
}

function normalizeStandingsEntry(value: unknown): StandingsEntry {
  if (!isRecord(value)) {
    throw new Error(
      "Invalid Adrena payload: standings entry must be an object."
    );
  }

  return {
    attainedAt: assertString(value.attained_at, "standings.attained_at"),
    badge: assertString(value.badge, "standings.badge"),
    consistencyScore: assertNumber(
      value.consistency_score,
      "standings.consistency_score"
    ),
    displayName: assertString(value.display_name, "standings.display_name"),
    disqualificationReason:
      value.disqualification_reason === undefined
        ? undefined
        : assertString(
            value.disqualification_reason,
            "standings.disqualification_reason"
          ),
    eligible: assertBoolean(value.eligible, "standings.eligible"),
    maxDrawdownPercent: assertNumber(
      value.max_drawdown_percent,
      "standings.max_drawdown_percent"
    ),
    pnlPercent: assertNumber(value.pnl_percent, "standings.pnl_percent"),
    questRewardPoints: assertNumber(
      value.quest_reward_points,
      "standings.quest_reward_points"
    ),
    raffleTicketsAwarded: assertNumber(
      value.raffle_tickets_awarded,
      "standings.raffle_tickets_awarded"
    ),
    rank: assertNumber(value.rank, "standings.rank"),
    tournamentScore: assertNumber(
      value.tournament_score,
      "standings.tournament_score"
    ),
    volumeUsd: assertNumber(value.volume_usd, "standings.volume_usd"),
    wallet: assertString(value.wallet, "standings.wallet"),
    winRate: assertNumber(value.win_rate, "standings.win_rate"),
  };
}

function normalizeAbuse(value: unknown): AbusePolicyResult {
  if (!isRecord(value)) {
    throw new Error("Invalid Adrena payload: abuse result must be an object.");
  }

  return {
    displayName: assertString(value.display_name, "abuse.display_name"),
    eligible: assertBoolean(value.eligible, "abuse.eligible"),
    flags: assertArray(value.flags, "abuse.flags").map((flag, index) =>
      assertString(flag, `abuse.flags[${index}]`)
    ) as AbusePolicyResult["flags"],
    reason:
      value.reason === undefined
        ? undefined
        : assertString(value.reason, "abuse.reason"),
    wallet: assertString(value.wallet, "abuse.wallet"),
  };
}

function normalizePreset(value: unknown): CompetitionCohortView["preset"] {
  if (!isRecord(value)) {
    throw new Error("Invalid Adrena payload: preset must be an object.");
  }

  return {
    focus: assertString(value.focus, "preset.focus"),
    id: assertString(value.id, "preset.id"),
    name: assertString(value.name, "preset.name"),
    questRewardPoints: assertNumber(
      value.quest_reward_points,
      "preset.quest_reward_points"
    ),
    raffleTickets: assertNumber(value.raffle_tickets, "preset.raffle_tickets"),
    streakMultiplier: assertNumber(
      value.streak_multiplier,
      "preset.streak_multiplier"
    ),
    tagline: assertString(value.tagline, "preset.tagline"),
  };
}

function normalizeCohort(value: unknown): CompetitionCohortView {
  if (!isRecord(value)) {
    throw new Error("Invalid Adrena payload: cohort must be an object.");
  }

  return {
    abuseResults: assertArray(value.abuse_results, "cohort.abuse_results").map(
      normalizeAbuse
    ),
    endTime: assertString(value.end_time, "cohort.end_time"),
    enrolledCount: assertNumber(value.enrolled_count, "cohort.enrolled_count"),
    entryFeeUsd: assertNumber(value.entry_fee_usd, "cohort.entry_fee_usd"),
    id: assertString(value.id, "cohort.id"),
    name: assertString(value.name, "cohort.name"),
    narrative: assertString(value.narrative, "cohort.narrative"),
    participantCap: assertNumber(
      value.participant_cap,
      "cohort.participant_cap"
    ),
    preset: normalizePreset(value.preset),
    rewardPoolUsd: assertNumber(
      value.reward_pool_usd,
      "cohort.reward_pool_usd"
    ),
    rewardPreview: assertArray(
      value.reward_preview,
      "cohort.reward_preview"
    ).map(normalizeReward),
    standings: assertArray(value.standings, "cohort.standings").map(
      normalizeStandingsEntry
    ),
    startTime: assertString(value.start_time, "cohort.start_time"),
    state: assertString(
      value.state,
      "cohort.state"
    ) as CompetitionCohortView["state"],
  };
}

function normalizeConfig(value: unknown): CompetitionConfig {
  if (!isRecord(value)) {
    throw new Error("Invalid Adrena payload: config must be an object.");
  }

  const scoringWeights = value.scoring_weights;
  if (!isRecord(scoringWeights)) {
    throw new Error(
      "Invalid Adrena payload: config.scoring_weights must be an object."
    );
  }

  return {
    cohortDurationHours: assertNumber(
      value.cohort_duration_hours,
      "config.cohort_duration_hours"
    ),
    entryFeeUsd: assertNumber(value.entry_fee_usd, "config.entry_fee_usd"),
    fundedRewardShareBps: assertNumber(
      value.funded_reward_share_bps,
      "config.funded_reward_share_bps"
    ),
    participantCap: assertNumber(
      value.participant_cap,
      "config.participant_cap"
    ),
    presets: assertArray(value.presets, "config.presets").map(normalizePreset),
    prizePoolSplit: assertArray(
      value.prize_pool_split,
      "config.prize_pool_split"
    ).map((item, index) =>
      assertNumber(item, `config.prize_pool_split[${index}]`)
    ),
    scoringWeights: {
      consistency: assertNumber(
        scoringWeights.consistency,
        "config.scoring_weights.consistency"
      ),
      drawdownPenalty: assertNumber(
        scoringWeights.drawdown_penalty,
        "config.scoring_weights.drawdown_penalty"
      ),
      pnlPercent: assertNumber(
        scoringWeights.pnl_percent,
        "config.scoring_weights.pnl_percent"
      ),
      volumeUsd: assertNumber(
        scoringWeights.volume_usd,
        "config.scoring_weights.volume_usd"
      ),
      winRate: assertNumber(
        scoringWeights.win_rate,
        "config.scoring_weights.win_rate"
      ),
    },
    seasonId: assertString(value.season_id, "config.season_id"),
  };
}

function normalizeSeason(value: unknown): SeasonSummary {
  if (!isRecord(value)) {
    throw new Error("Invalid Adrena payload: season must be an object.");
  }

  return {
    cohortsRunning: assertNumber(
      value.cohorts_running,
      "season.cohorts_running"
    ),
    paidEntries: assertNumber(value.paid_entries, "season.paid_entries"),
    seasonId: assertString(value.season_id, "season.season_id"),
    title: assertString(value.title, "season.title"),
    totalPrizePoolUsd: assertNumber(
      value.total_prize_pool_usd,
      "season.total_prize_pool_usd"
    ),
    volumeSharePercent: assertNumber(
      value.volume_share_percent,
      "season.volume_share_percent"
    ),
  };
}

function normalizeViewer(value: unknown): ViewerCompetitionState {
  if (!isRecord(value)) {
    throw new Error("Invalid Adrena payload: viewer must be an object.");
  }

  return {
    connected: assertBoolean(value.connected, "viewer.connected"),
    displayName: assertString(value.display_name, "viewer.display_name"),
    enrolledCohortId:
      value.enrolled_cohort_id === null
        ? null
        : assertString(value.enrolled_cohort_id, "viewer.enrolled_cohort_id"),
    fundedStatus: assertString(
      value.funded_status,
      "viewer.funded_status"
    ) as ViewerCompetitionState["fundedStatus"],
    questProgress: assertArray(
      value.quest_progress,
      "viewer.quest_progress"
    ).map((item, index) => {
      if (!isRecord(item)) {
        throw new Error(
          `Invalid Adrena payload: viewer.quest_progress[${index}] must be an object.`
        );
      }

      return {
        label: assertString(
          item.label,
          `viewer.quest_progress[${index}].label`
        ),
        progress: assertNumber(
          item.progress,
          `viewer.quest_progress[${index}].progress`
        ),
        target: assertNumber(
          item.target,
          `viewer.quest_progress[${index}].target`
        ),
      };
    }),
    raffleTickets: assertNumber(value.raffle_tickets, "viewer.raffle_tickets"),
    rewardPreview:
      value.reward_preview === null
        ? null
        : normalizeReward(value.reward_preview),
    seasonPoints: assertNumber(value.season_points, "viewer.season_points"),
    streakDays: assertNumber(value.streak_days, "viewer.streak_days"),
    streakState: assertString(
      value.streak_state,
      "viewer.streak_state"
    ) as ViewerCompetitionState["streakState"],
    wallet: assertString(value.wallet, "viewer.wallet"),
  };
}

export function normalizeAdrenaSnapshotPayload(
  payload: unknown
): CompetitionSnapshot {
  if (!isRecord(payload)) {
    throw new Error("Invalid Adrena payload: root must be an object.");
  }

  return {
    config: normalizeConfig(payload.config),
    cohorts: assertArray(payload.cohorts, "cohorts").map(normalizeCohort),
    season: normalizeSeason(payload.season),
    viewer: normalizeViewer(payload.viewer),
  };
}

function mapPreset(
  preset: CompetitionCohortView["preset"]
): AdrenaUpstreamPreset {
  return {
    focus: preset.focus,
    id: preset.id,
    name: preset.name,
    quest_reward_points: preset.questRewardPoints,
    raffle_tickets: preset.raffleTickets,
    streak_multiplier: preset.streakMultiplier,
    tagline: preset.tagline,
  };
}

function mapReward(reward: RewardPreview): AdrenaUpstreamReward {
  return {
    display_name: reward.displayName,
    funded_status: reward.fundedStatus,
    payout_usd: reward.payoutUsd,
    rank: reward.rank,
    revenue_share_bps: reward.revenueShareBps,
    wallet: reward.wallet,
  };
}

function mapStandingsEntry(
  entry: StandingsEntry
): AdrenaUpstreamStandingsEntry {
  return {
    attained_at: entry.attainedAt,
    badge: entry.badge,
    consistency_score: entry.consistencyScore,
    display_name: entry.displayName,
    disqualification_reason: entry.disqualificationReason,
    eligible: entry.eligible,
    max_drawdown_percent: entry.maxDrawdownPercent,
    pnl_percent: entry.pnlPercent,
    quest_reward_points: entry.questRewardPoints,
    raffle_tickets_awarded: entry.raffleTicketsAwarded,
    rank: entry.rank,
    tournament_score: entry.tournamentScore,
    volume_usd: entry.volumeUsd,
    wallet: entry.wallet,
    win_rate: entry.winRate,
  };
}

function mapAbuseResult(result: AbusePolicyResult): AdrenaUpstreamAbuseResult {
  return {
    display_name: result.displayName,
    eligible: result.eligible,
    flags: result.flags,
    reason: result.reason,
    wallet: result.wallet,
  };
}

function mapViewer(viewer: ViewerCompetitionState): AdrenaUpstreamViewerState {
  return {
    connected: viewer.connected,
    display_name: viewer.displayName,
    enrolled_cohort_id: viewer.enrolledCohortId,
    funded_status: viewer.fundedStatus,
    quest_progress: viewer.questProgress,
    raffle_tickets: viewer.raffleTickets,
    reward_preview: viewer.rewardPreview
      ? mapReward(viewer.rewardPreview)
      : null,
    season_points: viewer.seasonPoints,
    streak_days: viewer.streakDays,
    streak_state: viewer.streakState,
    wallet: viewer.wallet,
  };
}

function mapSeason(season: SeasonSummary) {
  return {
    cohorts_running: season.cohortsRunning,
    paid_entries: season.paidEntries,
    season_id: season.seasonId,
    title: season.title,
    total_prize_pool_usd: season.totalPrizePoolUsd,
    volume_share_percent: season.volumeSharePercent,
  };
}

function mapConfig(config: CompetitionConfig): AdrenaUpstreamConfig {
  return {
    cohort_duration_hours: config.cohortDurationHours,
    entry_fee_usd: config.entryFeeUsd,
    funded_reward_share_bps: config.fundedRewardShareBps,
    participant_cap: config.participantCap,
    presets: config.presets.map(mapPreset),
    prize_pool_split: config.prizePoolSplit,
    scoring_weights: {
      consistency: config.scoringWeights.consistency,
      drawdown_penalty: config.scoringWeights.drawdownPenalty,
      pnl_percent: config.scoringWeights.pnlPercent,
      volume_usd: config.scoringWeights.volumeUsd,
      win_rate: config.scoringWeights.winRate,
    },
    season_id: config.seasonId,
  };
}

function mapCohort(cohort: CompetitionCohortView): AdrenaUpstreamCohort {
  return {
    abuse_results: cohort.abuseResults.map(mapAbuseResult),
    end_time: cohort.endTime,
    enrolled_count: cohort.enrolledCount,
    entry_fee_usd: cohort.entryFeeUsd,
    id: cohort.id,
    name: cohort.name,
    narrative: cohort.narrative,
    participant_cap: cohort.participantCap,
    preset: mapPreset(cohort.preset),
    reward_pool_usd: cohort.rewardPoolUsd,
    reward_preview: cohort.rewardPreview.map(mapReward),
    standings: cohort.standings.map(mapStandingsEntry),
    start_time: cohort.startTime,
    state: cohort.state,
  };
}

export function toAdrenaSnapshotPayload(
  snapshot: CompetitionSnapshot,
  source = "adrena-live"
): AdrenaUpstreamSnapshotPayload {
  return {
    config: mapConfig(snapshot.config),
    cohorts: snapshot.cohorts.map(mapCohort),
    meta: {
      generated_at: new Date().toISOString(),
      schema_version: "adrena-competition-snapshot-v1",
      source,
    },
    season: mapSeason(snapshot.season),
    viewer: mapViewer(snapshot.viewer),
  };
}
