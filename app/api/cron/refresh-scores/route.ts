/**
 * Cron Endpoint: Refresh Scores
 *
 * Called every 5 minutes via external scheduler. This is the central
 * server-side pipeline that ties together:
 * - Cohort state from Postgres
 * - Live position data from Adrena
 * - Challenge evaluation (pass/fail)
 * - Quest event emission
 * - Trader score persistence
 * - Cohort state transitions (live → settled)
 * - Raffle draws for settled cohorts
 */

import { NextResponse } from "next/server";
import {
  getActiveCohorts,
  getEnrolledWalletsForCohort,
  upsertTraderScore,
  updateCohortState,
  getCohort,
} from "@/lib/db/queries";
import { fetchPositions } from "@/lib/adrena/client";
import { computeMetricsFromPositions } from "@/lib/adrena/metrics";
import {
  computeTournamentScore,
  evaluateChallenge,
} from "@/lib/competition/engine";
import { emitChallengeQuestEvents } from "@/lib/competition/quest-emitter";
import { drawRaffle, recordBuyback } from "@/lib/competition/raffle";
import { notifySybilAlert } from "@/lib/notifications/discord-webhook";
import { runSybilDetection } from "@/lib/competition/sybil-workflow";
import { competitionConfig } from "@/lib/competition/config";
import type { AdrenaPosition } from "@/lib/adrena/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const now = new Date();
  const cohorts = await getActiveCohorts();
  const results: Array<{
    cohortId: string;
    walletsScored: number;
    settled: boolean;
  }> = [];

  for (const cohort of cohorts) {
    const windowStart = cohort.startTime;
    const windowEnd = cohort.endTime;

    // Check if cohort should be settled
    if (now > windowEnd && cohort.state === "live") {
      await updateCohortState(cohort.id, "settled");

      // Trigger raffle and buyback for settled cohort
      const enrolledCount = (await getEnrolledWalletsForCohort(cohort.id))
        .length;
      const totalFees = enrolledCount * cohort.entryFeeUsd;
      await drawRaffle(cohort.id, totalFees).catch((err) =>
        console.warn(
          `[refresh-scores] Raffle draw failed for ${cohort.id}:`,
          err
        )
      );
      await recordBuyback(cohort.id, totalFees).catch((err) =>
        console.warn(
          `[refresh-scores] Buyback record failed for ${cohort.id}:`,
          err
        )
      );

      results.push({ cohortId: cohort.id, walletsScored: 0, settled: true });
      continue;
    }

    // Skip upcoming cohorts
    if (cohort.state !== "live") continue;

    const wallets = await getEnrolledWalletsForCohort(cohort.id);
    if (wallets.length === 0) continue;

    // Fetch positions for all wallets
    const positionsByWallet = new Map<string, AdrenaPosition[]>();
    await Promise.all(
      wallets.map(async (wallet) => {
        try {
          const positions = await fetchPositions(wallet);
          positionsByWallet.set(wallet, positions);
        } catch {
          positionsByWallet.set(wallet, []);
        }
      })
    );

    const cohortDurationDays = Math.max(
      1,
      Math.round(
        (windowEnd.getTime() - windowStart.getTime()) / (1000 * 60 * 60 * 24)
      )
    );

    // Score each wallet
    let walletsScored = 0;
    for (const wallet of wallets) {
      const positions = positionsByWallet.get(wallet) ?? [];
      const performance = computeMetricsFromPositions(
        positions,
        windowStart,
        windowEnd
      );

      const profile = {
        wallet,
        displayName: `${wallet.slice(0, 4)}...${wallet.slice(-4)}`,
        badge: "Trader",
        performance,
        seasonPoints: 0,
        fundedStatus: "none" as const,
        questProgress: [],
        streakDays: 0,
        streakState: "broken" as const,
        raffleTickets: 0,
        abuseFlags: [] as [],
      };

      const tournamentScore = computeTournamentScore(
        profile,
        (cohort.scoringMode as "standard" | "raroi") ?? "standard",
        cohortDurationDays
      );

      await upsertTraderScore({
        wallet,
        cohortId: cohort.id,
        tournamentScore,
        pnlPercent: performance.pnlPercent,
        volumeUsd: performance.volumeUsd,
        winRate: performance.winRate,
        consistencyScore: performance.consistencyScore,
        maxDrawdownPercent: performance.maxDrawdownPercent,
        tradeCount: performance.tradeCount ?? 0,
        activeDays: performance.activeDays ?? 0,
      });

      // Emit quest events based on performance
      const tier = competitionConfig.presets.find(
        (p) => p.id === cohort.presetId
      );
      await emitChallengeQuestEvents({
        wallet,
        passed: performance.pnlPercent >= 8, // simplified pass check
        hadPriorFailure: false,
        tierName: tier?.name ?? "Scout",
        maxDrawdownPercent: performance.maxDrawdownPercent,
        cumulativeVolumeUsd: performance.volumeUsd,
        specialistType: cohort.specialistType ?? undefined,
      }).catch(() => {});

      walletsScored++;
    }

    // Run sybil detection
    const sybilResult = await runSybilDetection(
      cohort.id,
      wallets,
      positionsByWallet,
      windowStart,
      windowEnd
    );

    if (sybilResult.flaggedWallets.length > 0) {
      await notifySybilAlert({
        cohortId: cohort.id,
        flaggedCount: sybilResult.flaggedWallets.length,
        clusters: sybilResult.clusters
          .filter((c) => c.flagged)
          .map((c) => ({ wallets: c.wallets, reason: c.reason })),
      }).catch(() => {});
    }

    results.push({ cohortId: cohort.id, walletsScored, settled: false });
  }

  console.log(
    `[cron/refresh-scores] Processed ${results.length} cohort(s):`,
    results.map(
      (r) =>
        `${r.cohortId} (${r.walletsScored} scored${r.settled ? ", settled" : ""})`
    )
  );

  return NextResponse.json({
    status: "scores_refreshed",
    results,
    processedAt: now.toISOString(),
  });
}
