import { fetchPositions, type AdrenaPosition } from "../adrena/client.ts";
import { getMarketInfo } from "../adrena/custody-map.ts";
import {
  computeMetricsFromPositions,
  computeMetricsFromTradeEvents,
} from "../adrena/metrics.ts";
import {
  getTradeEventsForWallet,
  getActiveCohorts,
  getEnrolledWalletsForCohort,
  enrollTrader as dbEnrollTrader,
} from "../db/queries.ts";
import {
  buildCompetitionSnapshotFromSources,
  type AdrenaLeaderboardRowSource,
  type AdrenaSourceSnapshotInput,
} from "./adrena-source-adapters.ts";
import { competitionConfig } from "./config.ts";
import { computeTournamentScore } from "./engine.ts";
import {
  computeAggregateMutagen,
  computeAggregateMutagenFromEvents,
} from "./mutagen.ts";
import {
  detectSybilClusters,
  detectTradingPatternCorrelation,
  detectPnlMirroring,
  applyConvergenceFilter,
  type TradeTimestampProfile,
  type PnlProfile,
} from "./sybil-detector.ts";
import { buildWalletInfos } from "./sybil-workflow.ts";
import { getBonusRaffleTickets } from "./streaks.ts";
import { getSpecialistChallenge } from "./tiers.ts";
import type {
  ChallengePreset,
  CompetitionConfig,
  CompetitionEnrollmentInput,
  CompetitionSnapshot,
  ScoringMode,
  TraderPerformance,
} from "./types.ts";

function getCompetitionApiBaseUrl(): string | undefined {
  return process.env.ADRENA_COMPETITION_API_BASE_URL;
}

/**
 * Fetch positions from the Competition Service API if configured,
 * otherwise fall back to the Adrena Data API.
 */
async function fetchPositionsForWallet(
  wallet: string
): Promise<AdrenaPosition[]> {
  const apiBaseUrl = getCompetitionApiBaseUrl();
  if (apiBaseUrl) {
    try {
      const response = await fetch(
        `${apiBaseUrl}/api/competitions/positions?wallet=${encodeURIComponent(wallet)}`,
        { next: { revalidate: 30 } }
      );
      if (response.ok) {
        return response.json() as Promise<AdrenaPosition[]>;
      }
    } catch {
      // Fall through to Data API
    }
  }
  return fetchPositions(wallet);
}

interface CohortEntry {
  id: string;
  name: string;
  presetId: string;
  state: string;
  startTime: string;
  endTime: string;
  narrative: string;
  rewardPoolUsd: number;
  entryFeeUsd: number;
  participantCap: number;
  enrolledWallets: string[];
  /** Optional specialist track type for DQ enforcement. */
  specialistType?: string;
  /** Scoring mode override for this cohort. */
  scoringMode?: ScoringMode;
}

interface CohortsFile {
  config: CompetitionConfig;
  cohorts: CohortEntry[];
}

/**
 * Load cohort data from PostgreSQL. Enrolled wallets come from the Enrollment
 * table rather than being embedded in a JSON file.
 */
async function fetchCohortsData(): Promise<CohortsFile> {
  const dbCohorts = await getActiveCohorts();

  const cohorts: CohortEntry[] = await Promise.all(
    dbCohorts.map(async (c) => {
      const enrolledWallets = await getEnrolledWalletsForCohort(c.id);
      return {
        id: c.id,
        name: c.name,
        presetId: c.presetId,
        state: c.state,
        startTime: c.startTime.toISOString(),
        endTime: c.endTime.toISOString(),
        narrative: c.narrative,
        rewardPoolUsd: c.rewardPoolUsd,
        entryFeeUsd: c.entryFeeUsd,
        participantCap: c.participantCap,
        enrolledWallets,
        specialistType: c.specialistType ?? undefined,
        scoringMode: c.scoringMode as ScoringMode | undefined,
      };
    })
  );

  return {
    config: competitionConfig,
    cohorts,
  };
}

function walletToDisplayName(wallet: string): string {
  if (wallet.length < 8) return wallet;
  return `${wallet.slice(0, 4)}...${wallet.slice(-4)}`;
}

function walletToBadge(wallet: string): string {
  const badges = [
    "Perp Trader",
    "Market Maker",
    "Swing Trader",
    "Scalper",
    "Position Trader",
  ];
  return badges[wallet.charCodeAt(0) % badges.length];
}

interface TradeEventRow {
  sizeUsd: number;
  collateralUsd: number;
  netPnl: number;
  closedAt: Date;
}

function buildLeaderboardRow(
  wallet: string,
  performance: TraderPerformance,
  rank: number,
  preset: ChallengePreset,
  opts?: {
    positions?: AdrenaPosition[];
    tradeEvents?: TradeEventRow[];
    windowStart?: Date;
    windowEnd?: Date;
    scoringMode?: ScoringMode;
    cohortDurationDays?: number;
  }
): AdrenaLeaderboardRowSource {
  const profile = {
    wallet,
    displayName: walletToDisplayName(wallet),
    badge: walletToBadge(wallet),
    performance,
    seasonPoints: 0,
    fundedStatus: "none" as const,
    questProgress: [],
    streakDays: 0,
    streakState: "broken" as const,
    raffleTickets: 0,
    abuseFlags: [] as import("../shared/types.ts").AbuseFlagCode[],
  };
  const tournamentScore = computeTournamentScore(
    profile,
    opts?.scoringMode ?? "standard",
    opts?.cohortDurationDays ?? 14
  );

  // Compute Mutagen — prefer trade events (official interpolated table), fall back to positions
  let mutagenTotal: number | undefined;
  let mutagenTradeCount: number | undefined;
  if (
    opts?.tradeEvents &&
    opts.tradeEvents.length > 0 &&
    opts.windowStart &&
    opts.windowEnd
  ) {
    const mutagen = computeAggregateMutagenFromEvents(
      opts.tradeEvents,
      opts.windowStart,
      opts.windowEnd
    );
    mutagenTotal = mutagen.totalMutagen;
    mutagenTradeCount = mutagen.tradeCount;
  } else if (opts?.positions && opts.windowStart && opts.windowEnd) {
    const mutagen = computeAggregateMutagen(
      opts.positions,
      opts.windowStart,
      opts.windowEnd
    );
    mutagenTotal = mutagen.totalMutagen;
    mutagenTradeCount = mutagen.tradeCount;
  }

  return {
    wallet,
    displayName: walletToDisplayName(wallet),
    badge: walletToBadge(wallet),
    rank,
    tournamentScore,
    pnlPercent: performance.pnlPercent,
    volumeUsd: performance.volumeUsd,
    winRate: performance.winRate,
    consistencyScore: performance.consistencyScore,
    maxDrawdownPercent: performance.maxDrawdownPercent,
    attainedAt: performance.attainedAt,
    tradeCount: performance.tradeCount ?? 0,
    activeDays: performance.activeDays ?? 0,
    questRewardPoints: preset.questRewardPoints,
    raffleTicketsAwarded: preset.raffleTickets,
    mutagenTotal,
    mutagenTradeCount,
  };
}

function deriveStreakDays(
  positions: AdrenaPosition[],
  windowStart: Date,
  windowEnd: Date
): number {
  const tradingDays = new Set(
    positions
      .filter((pos) => {
        if (!pos.exit_date) return false;
        const exitMs = new Date(pos.exit_date).getTime();
        return exitMs >= windowStart.getTime() && exitMs <= windowEnd.getTime();
      })
      .map((pos) => pos.exit_date!.slice(0, 10))
  );
  return tradingDays.size;
}

function deriveStreakState(
  positions: AdrenaPosition[],
  windowEnd: Date
): "alive" | "warning" | "broken" {
  const lastExit = positions
    .filter(
      (pos) =>
        (pos.status === "close" || pos.status === "liquidate") && pos.exit_date
    )
    .map((pos) => new Date(pos.exit_date!).getTime())
    .sort((a, b) => b - a)[0];

  if (!lastExit) return "broken";
  const daysSinceLastTrade =
    (windowEnd.getTime() - lastExit) / (1000 * 60 * 60 * 24);
  if (daysSinceLastTrade <= 1) return "alive";
  if (daysSinceLastTrade <= 3) return "warning";
  return "broken";
}

function deriveStreakDaysFromEvents(
  events: { closedAt: Date }[],
  windowStart: Date,
  windowEnd: Date
): number {
  const tradingDays = new Set(
    events
      .filter((e) => {
        const ms = e.closedAt.getTime();
        return ms >= windowStart.getTime() && ms <= windowEnd.getTime();
      })
      .map((e) => e.closedAt.toISOString().slice(0, 10))
  );
  return tradingDays.size;
}

function deriveStreakStateFromEvents(
  events: { closedAt: Date }[],
  windowEnd: Date
): "alive" | "warning" | "broken" {
  if (events.length === 0) return "broken";
  const lastClose = Math.max(...events.map((e) => e.closedAt.getTime()));
  const daysSinceLastTrade =
    (windowEnd.getTime() - lastClose) / (1000 * 60 * 60 * 24);
  if (daysSinceLastTrade <= 1) return "alive";
  if (daysSinceLastTrade <= 3) return "warning";
  return "broken";
}

export const adrenaLiveAdapter = {
  async getSnapshot(
    viewerWallet?: string,
    enrolledCohortId?: string | null
  ): Promise<CompetitionSnapshot> {
    const file = await fetchCohortsData();
    const { config, cohorts } = file;

    // Collect all unique wallets across all cohorts
    const allWallets = new Set<string>();
    for (const cohort of cohorts) {
      for (const w of cohort.enrolledWallets) allWallets.add(w);
    }
    if (viewerWallet) allWallets.add(viewerWallet);

    // ── Dual data path: try DB trade events first, fall back to REST ──
    // Trade events come from the WebSocket consumer (real-time, persisted).
    // REST positions are the fallback when WS is not running.
    const tradeEventsByWalletCohort = new Map<
      string,
      Awaited<ReturnType<typeof getTradeEventsForWallet>>
    >();
    const positionsByWallet = new Map<string, AdrenaPosition[]>();

    // Try loading trade events from DB for each wallet+cohort pair
    for (const cohort of cohorts) {
      const windowStart = new Date(cohort.startTime);
      const windowEnd = new Date(cohort.endTime);
      for (const wallet of cohort.enrolledWallets) {
        const key = `${wallet}::${cohort.id}`;
        try {
          const events = await getTradeEventsForWallet(
            wallet,
            windowStart,
            windowEnd
          );
          tradeEventsByWalletCohort.set(key, events);
        } catch {
          tradeEventsByWalletCohort.set(key, []);
        }
      }
    }

    // For wallets with no DB events, fetch positions from REST API
    const walletsNeedingRest = new Set<string>();
    for (const cohort of cohorts) {
      for (const wallet of cohort.enrolledWallets) {
        const key = `${wallet}::${cohort.id}`;
        const events = tradeEventsByWalletCohort.get(key) ?? [];
        if (events.length === 0 && !positionsByWallet.has(wallet)) {
          walletsNeedingRest.add(wallet);
        }
      }
    }
    if (viewerWallet && !positionsByWallet.has(viewerWallet)) {
      walletsNeedingRest.add(viewerWallet);
    }

    // Fetch REST positions in parallel for wallets that need it
    await Promise.all(
      [...walletsNeedingRest].map(async (wallet) => {
        try {
          const positions = await fetchPositionsForWallet(wallet);
          positionsByWallet.set(wallet, positions);
        } catch {
          positionsByWallet.set(wallet, []);
        }
      })
    );

    // Build leaderboard per cohort
    const leaderboardByCohort: Record<string, AdrenaLeaderboardRowSource[]> =
      {};
    const abuseReviewsByCohort: AdrenaSourceSnapshotInput["abuseReviewsByCohort"] =
      {};

    for (const cohort of cohorts) {
      const preset = config.presets.find((p) => p.id === cohort.presetId);
      if (!preset) continue;

      const windowStart = new Date(cohort.startTime);
      const windowEnd = new Date(cohort.endTime);

      const wallets = [...cohort.enrolledWallets];
      if (
        viewerWallet &&
        enrolledCohortId === cohort.id &&
        !wallets.includes(viewerWallet)
      ) {
        wallets.push(viewerWallet);
      }

      const cohortDurationDays = Math.max(
        1,
        Math.round(
          (windowEnd.getTime() - windowStart.getTime()) / (1000 * 60 * 60 * 24)
        )
      );

      const rows: AdrenaLeaderboardRowSource[] = wallets.map((wallet) => {
        const key = `${wallet}::${cohort.id}`;
        const tradeEvents = tradeEventsByWalletCohort.get(key) ?? [];

        // Prefer trade events (WebSocket-sourced) over REST positions
        if (tradeEvents.length > 0) {
          const performance = computeMetricsFromTradeEvents(
            tradeEvents,
            windowStart,
            windowEnd
          );
          return buildLeaderboardRow(wallet, performance, 0, preset, {
            tradeEvents,
            windowStart,
            windowEnd,
            scoringMode: cohort.scoringMode,
            cohortDurationDays,
          });
        }

        // Fallback: REST positions
        const positions = positionsByWallet.get(wallet) ?? [];
        const performance = computeMetricsFromPositions(
          positions,
          windowStart,
          windowEnd
        );
        return buildLeaderboardRow(wallet, performance, 0, preset, {
          positions,
          windowStart,
          windowEnd,
          scoringMode: cohort.scoringMode,
          cohortDurationDays,
        });
      });

      // Sort by tournamentScore descending, assign ranks
      rows.sort((a, b) => b.tournamentScore - a.tournamentScore);
      rows.forEach((row, i) => {
        row.rank = i + 1;
      });

      // Run sybil and abuse detection on this cohort.
      // Uses real RPC-based funding source resolution and convergence filtering:
      // a wallet is only flagged if it appears in clusters from all 3 distinct
      // heuristic types (funding source, trading pattern, P&L mirroring).
      const cohortWalletInfos = await buildWalletInfos(wallets, windowStart);
      const fundingClusters = detectSybilClusters(cohortWalletInfos);

      // Trading pattern correlation — use trade event timestamps if available, else REST positions
      const tradeProfiles: TradeTimestampProfile[] = wallets.map((wallet) => {
        const key = `${wallet}::${cohort.id}`;
        const events = tradeEventsByWalletCohort.get(key) ?? [];
        if (events.length > 0) {
          return {
            wallet,
            timestamps: events.map((e) => e.closedAt.getTime()),
          };
        }
        const positions = positionsByWallet.get(wallet) ?? [];
        return {
          wallet,
          timestamps: positions
            .filter((p) => p.exit_date)
            .map((p) => new Date(p.exit_date!).getTime()),
        };
      });
      const patternClusters = detectTradingPatternCorrelation(tradeProfiles);

      // P&L mirroring detection
      const pnlProfiles: PnlProfile[] = rows.map((row) => ({
        wallet: row.wallet,
        pnlPercent: row.pnlPercent,
      }));
      const mirrorClusters = detectPnlMirroring(pnlProfiles);

      // Merge all clusters and apply convergence filter — only flag wallets
      // that appear in 3+ distinct heuristic types
      const allClusters = [
        ...fundingClusters,
        ...patternClusters,
        ...mirrorClusters,
      ];
      const convergedWallets = applyConvergenceFilter(allClusters, 3);
      const cohortAbuseFlags: Array<{
        wallet: string;
        flagCode: string;
        reason: string;
      }> = allClusters
        .filter((c) => c.flagged)
        .flatMap((c) =>
          c.wallets
            .filter((w) => convergedWallets.has(w))
            .map((w) => ({
              wallet: w,
              flagCode:
                c.heuristicType === "pnl_mirror"
                  ? "wash_trading_suspicion"
                  : "sybil_suspicion",
              reason: c.reason,
            }))
        );

      // ── Specialist track DQ enforcement ──
      // If the cohort has a specialist type, check each trader's trade events
      // for trades on disallowed markets (custody mints outside the track).
      const specialist = cohort.specialistType
        ? getSpecialistChallenge(cohort.specialistType)
        : undefined;

      if (specialist) {
        for (const wallet of wallets) {
          const key = `${wallet}::${cohort.id}`;
          const events = tradeEventsByWalletCohort.get(key) ?? [];
          const disallowedMarkets: string[] = [];

          for (const event of events) {
            const info = getMarketInfo(event.custodyMint);
            if (info && !specialist.markets.includes(info.market)) {
              disallowedMarkets.push(info.market);
            }
          }

          if (disallowedMarkets.length > 0) {
            const unique = [...new Set(disallowedMarkets)].join(", ");
            cohortAbuseFlags.push({
              wallet,
              flagCode: "specialist_violation",
              reason: `Traded on disallowed market(s) [${unique}]. Only [${specialist.markets.join(", ")}] are permitted for ${specialist.name}.`,
            });
          }
        }
      }

      // Re-sort: flagged wallets sort below all eligible traders
      const flaggedWalletSet = new Set(cohortAbuseFlags.map((f) => f.wallet));
      rows.sort((a, b) => {
        const aFlagged = flaggedWalletSet.has(a.wallet) ? 1 : 0;
        const bFlagged = flaggedWalletSet.has(b.wallet) ? 1 : 0;
        if (aFlagged !== bFlagged) return aFlagged - bFlagged;
        return b.tournamentScore - a.tournamentScore;
      });
      rows.forEach((row, i) => {
        row.rank = i + 1;
      });

      leaderboardByCohort[cohort.id] = rows;
      abuseReviewsByCohort[cohort.id] = cohortAbuseFlags.map((f) => ({
        wallet: f.wallet,
        cohortId: cohort.id,
        displayName: walletToDisplayName(f.wallet),
        flags: [f.flagCode] as import("../shared/types.ts").AbuseFlagCode[],
        reason: f.reason,
      }));
    }

    // Build viewer state
    const now = new Date();
    const viewerEnrolledCohort = cohorts.find((c) => c.id === enrolledCohortId);

    const viewerWindowStart = viewerEnrolledCohort
      ? new Date(viewerEnrolledCohort.startTime)
      : new Date(now.getTime() - 72 * 60 * 60 * 1000);
    const viewerWindowEnd = viewerEnrolledCohort
      ? new Date(viewerEnrolledCohort.endTime)
      : now;

    // Viewer metrics: prefer DB trade events, fall back to REST positions
    let viewerMetrics: TraderPerformance | null = null;
    let streakDays = 0;
    let streakState: "alive" | "warning" | "broken" = "broken";

    if (viewerWallet) {
      const viewerKey = viewerEnrolledCohort
        ? `${viewerWallet}::${viewerEnrolledCohort.id}`
        : null;
      const viewerTradeEvents = viewerKey
        ? (tradeEventsByWalletCohort.get(viewerKey) ?? [])
        : [];

      if (viewerTradeEvents.length > 0) {
        viewerMetrics = computeMetricsFromTradeEvents(
          viewerTradeEvents,
          viewerWindowStart,
          viewerWindowEnd
        );
        streakDays = deriveStreakDaysFromEvents(
          viewerTradeEvents,
          viewerWindowStart,
          viewerWindowEnd
        );
        streakState = deriveStreakStateFromEvents(
          viewerTradeEvents,
          viewerWindowEnd
        );
      } else {
        const viewerPositions = positionsByWallet.get(viewerWallet) ?? [];
        viewerMetrics = computeMetricsFromPositions(
          viewerPositions,
          viewerWindowStart,
          viewerWindowEnd
        );
        streakDays = deriveStreakDays(
          viewerPositions,
          viewerWindowStart,
          viewerWindowEnd
        );
        streakState = deriveStreakState(viewerPositions, viewerWindowEnd);
      }
    }

    const cohortTotalEntries = cohorts.reduce(
      (sum, c) => sum + c.enrolledWallets.length,
      0
    );

    const input: AdrenaSourceSnapshotInput = {
      config: {
        cohortDurationHours: config.cohortDurationHours,
        entryFeeUsd: config.entryFeeUsd,
        fundedRewardShareBps: config.fundedRewardShareBps,
        participantCap: config.participantCap,
        presets: config.presets,
        prizePoolSplit: config.prizePoolSplit,
        scoringWeights: config.scoringWeights,
        seasonId: config.seasonId,
      },
      season: {
        seasonId: config.seasonId,
        title: `Season ${config.seasonId.replace("season-", "")} Competition`,
        cohortsRunning: cohorts.filter((c) => c.state === "live").length,
        paidEntries: cohortTotalEntries,
        totalPrizePoolUsd: cohorts.reduce((sum, c) => sum + c.rewardPoolUsd, 0),
        volumeSharePercent: 0.15,
      },
      cohorts: cohorts.map((c) => ({
        id: c.id,
        name: c.name,
        presetId: c.presetId,
        state: c.state as CompetitionSnapshot["cohorts"][number]["state"],
        startTime: c.startTime,
        endTime: c.endTime,
        narrative: c.narrative,
        rewardPoolUsd: c.rewardPoolUsd,
        entryFeeUsd: c.entryFeeUsd,
        participantCap: c.participantCap,
      })),
      leaderboardByCohort,
      abuseReviewsByCohort,
      viewer: {
        wallet: viewerWallet ?? "No wallet connected",
        displayName: viewerWallet
          ? walletToDisplayName(viewerWallet)
          : "Connect wallet",
        connected: Boolean(viewerWallet),
        enrolledCohortId: enrolledCohortId ?? null,
        fundedStatus: "none",
        seasonPoints: viewerMetrics
          ? Math.round(
              computeTournamentScore(
                {
                  wallet: viewerWallet!,
                  displayName: walletToDisplayName(viewerWallet!),
                  badge: walletToBadge(viewerWallet!),
                  performance: viewerMetrics,
                  seasonPoints: 0,
                  fundedStatus: "none",
                  questProgress: [],
                  streakDays,
                  streakState,
                  raffleTickets: 0,
                  abuseFlags: [],
                },
                viewerEnrolledCohort?.scoringMode ??
                  config.scoringMode ??
                  "standard"
              ) * 10
            )
          : 0,
        questProgress: [
          {
            label: "Challenge Volume",
            progress: viewerMetrics
              ? Math.round(viewerMetrics.volumeUsd / 1000)
              : 0,
            target: 100,
          },
          {
            label: "Positive Sessions",
            progress: viewerMetrics
              ? Math.max(1, Math.round(viewerMetrics.winRate / 11))
              : 0,
            target: 6,
          },
        ],
        streakDays,
        streakState,
        raffleTickets:
          Math.min(5, streakDays > 0 ? streakDays : 0) +
          getBonusRaffleTickets(streakDays),
      },
    };

    return buildCompetitionSnapshotFromSources(input);
  },

  async enrollTrader(
    input: CompetitionEnrollmentInput
  ): Promise<CompetitionSnapshot> {
    // Enrollment is persisted to Postgres via the enroll API route
    // (which calls enrollTrader in db/queries.ts). This method just
    // refreshes the snapshot after enrollment.
    return this.getSnapshot(input.wallet, input.cohortId);
  },
};
