import { getLeaderboard, getEnrollmentsForCohort, saveCompetitionResult, getCohort, updateCohortState } from "@/lib/db/queries";
import { executeSettlements, loadAuthorityKeypair, usdToUsdc } from "@/lib/solana/settle";
import { competitionConfig } from "@/lib/competition/config";
import { prisma } from "@/lib/db/client";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";

/**
 * POST /api/admin/settle — Settle a challenge cohort.
 *
 * Reads final scores from the TraderScore table, writes CompetitionResult
 * entries, and optionally executes on-chain settlement transactions.
 *
 * Body: { cohortId: string, executeOnChain?: boolean, dryRun?: boolean }
 */
export async function POST(request: NextRequest) {
  const authError = requireAdmin(request);
  if (authError) return authError;

  try {
    const body = await request.json();
    const { cohortId, executeOnChain, dryRun } = body as {
      cohortId: string;
      executeOnChain?: boolean;
      dryRun?: boolean;
    };

    if (!cohortId) {
      return NextResponse.json(
        { error: "cohortId is required" },
        { status: 400 }
      );
    }

    const cohort = await getCohort(cohortId);
    const rewardPoolUsd = cohort?.rewardPoolUsd ?? 0;
    const prizePoolSplit = competitionConfig.prizePoolSplit;

    const [leaderboard, enrollments] = await Promise.all([
      getLeaderboard(cohortId),
      getEnrollmentsForCohort(cohortId),
    ]);

    if (leaderboard.length === 0) {
      return NextResponse.json(
        { error: "No scores found for this cohort" },
        { status: 404 }
      );
    }

    const enrolledWallets = new Set(enrollments.map((e) => e.wallet));

    // Build settlement entries — only for enrolled traders with scores
    const settlements = [];
    for (let i = 0; i < leaderboard.length; i++) {
      const score = leaderboard[i];
      if (!enrolledWallets.has(score.wallet)) continue;

      const rank = i + 1;
      const passed = score.pnlPercent > 0 && score.maxDrawdownPercent < 15;

      const splitFraction = rank <= prizePoolSplit.length ? prizePoolSplit[rank - 1] : 0;
      const payoutUsd = passed ? rewardPoolUsd * splitFraction : 0;

      // Save competition result to DB
      await saveCompetitionResult({
        cohortId,
        wallet: score.wallet,
        finalRank: rank,
        finalScore: score.tournamentScore,
        payoutUsd,
        fundedStatus: passed && rank <= 5 ? "funded" : "none",
      });

      settlements.push({
        wallet: score.wallet,
        rank,
        passed,
        payoutUsd,
        finalPnlBps: Math.round(score.pnlPercent * 100),
        finalDrawdownBps: Math.round(score.maxDrawdownPercent * 100),
        tournamentScore: score.tournamentScore,
      });
    }

    // ── On-chain settlement execution ──────────────────────────────────
    let onChainResult: { signatures: string[]; errors: Array<{ wallet: string; error: string }> } | undefined;

    if (executeOnChain) {
      const authority = loadAuthorityKeypair();

      const { signatures, errors } = await executeSettlements({
        authority,
        challengeId: cohortId,
        settlements: settlements.map((s) => ({
          wallet: s.wallet,
          passed: s.passed,
          payoutUsdc: usdToUsdc(s.payoutUsd),
          finalPnlBps: s.finalPnlBps,
          finalDrawdownBps: s.finalDrawdownBps,
        })),
        dryRun,
      });

      onChainResult = { signatures, errors };

      // Store settlement tx signatures in CompetitionResult records
      if (signatures.length > 0 && !dryRun) {
        const BATCH_SIZE = 5;
        for (let i = 0; i < settlements.length; i++) {
          const sigIndex = Math.floor(i / BATCH_SIZE);
          const sig = signatures[sigIndex];
          if (sig) {
            await prisma.competitionResult.updateMany({
              where: { cohortId, wallet: settlements[i].wallet },
              data: { settleTxSignature: sig },
            });
          }
        }
      }
    }

    // Mark cohort as closed in the database
    await updateCohortState(cohortId, "closed");

    return NextResponse.json({
      cohortId,
      settledCount: settlements.length,
      settlements,
      ...(onChainResult && { onChain: onChainResult }),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
