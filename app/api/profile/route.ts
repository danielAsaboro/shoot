import { prisma } from "@/lib/db/client";
import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/profile?wallet=<address>
 *
 * Returns aggregated profile data for the given wallet, pulling from:
 * - TraderScore (performance stats across cohorts)
 * - CompetitionResult (challenge history, funded status)
 * - StreakState (current streak)
 * - QuestProgress (badge progress)
 * - Enrollment (enrollment history)
 * - WorldCupMatch (world cup participation)
 */
export async function GET(request: NextRequest) {
  const wallet = request.nextUrl.searchParams.get("wallet");

  if (!wallet) {
    return NextResponse.json({ found: false });
  }

  try {
    // Run all queries in parallel
    const [
      scores,
      results,
      streak,
      quests,
      enrollments,
      worldCupMatches,
    ] = await Promise.all([
      prisma.traderScore.findMany({
        where: { wallet },
        orderBy: { computedAt: "desc" },
      }),
      prisma.competitionResult.findMany({
        where: { wallet },
        orderBy: { completedAt: "desc" },
      }),
      prisma.streakState.findUnique({
        where: { wallet },
      }),
      prisma.questProgress.findMany({
        where: { wallet },
      }),
      prisma.enrollment.findMany({
        where: { wallet },
        orderBy: { enrolledAt: "desc" },
      }),
      prisma.worldCupMatch.findMany({
        where: {
          OR: [{ traderA: wallet }, { traderB: wallet }],
        },
        orderBy: { scheduledAt: "desc" },
      }),
    ]);

    // If we have no data at all, return not found
    if (
      scores.length === 0 &&
      results.length === 0 &&
      !streak &&
      quests.length === 0 &&
      enrollments.length === 0
    ) {
      return NextResponse.json({ found: false });
    }

    // --- Performance stats from the latest TraderScore ---
    const latestScore = scores[0] ?? null;
    const performance = latestScore
      ? {
          pnlPercent: latestScore.pnlPercent,
          winRate: latestScore.winRate,
          consistencyScore: latestScore.consistencyScore,
          maxDrawdownPercent: latestScore.maxDrawdownPercent,
          volumeUsd: latestScore.volumeUsd,
        }
      : null;

    // --- Overall score: best tournament score ---
    const overallScore = scores.length > 0
      ? Math.max(...scores.map((s) => s.tournamentScore))
      : 0;

    // --- Season rank: best finalRank from results ---
    const bestResult = results.length > 0
      ? results.reduce((best, r) => (r.finalRank < best.finalRank ? r : best), results[0])
      : null;
    const seasonRank = bestResult?.finalRank ?? null;

    // --- Funded status ---
    const hasFundedResult = results.some(
      (r) => r.fundedStatus === "qualified" || r.fundedStatus === "funded"
    );

    // --- Streak ---
    const streakDays = streak?.streakDays ?? 0;

    // --- Earned badges ---
    const earnedBadgeIds: string[] = [];

    // Tier completion badges: check if any CompetitionResult has a cohortId
    // containing the tier name and the result implies passing (fundedStatus or
    // good finalRank). We derive tier from cohortId pattern.
    const tierBadgeMap: Record<string, string> = {
      scout: "scout_complete",
      ranger: "ranger_complete",
      veteran: "veteran_complete",
      elite: "elite_complete",
      apex: "apex_complete",
    };

    for (const result of results) {
      const cohortLower = result.cohortId.toLowerCase();
      for (const [tier, badgeId] of Object.entries(tierBadgeMap)) {
        if (cohortLower.includes(tier) && !earnedBadgeIds.includes(badgeId)) {
          earnedBadgeIds.push(badgeId);
        }
      }
    }

    // Funded trader badge
    if (hasFundedResult) {
      earnedBadgeIds.push("funded_trader");
    }

    // Unbreakable badge (10-day streak)
    if (streakDays >= 10) {
      earnedBadgeIds.push("unbreakable");
    }

    // Quest-based badges
    for (const quest of quests) {
      if (quest.completedAt) {
        // Quest IDs may directly map to badge IDs
        earnedBadgeIds.push(quest.questId);
      }
    }

    // Deduplicate
    const uniqueBadgeIds = Array.from(new Set(earnedBadgeIds));

    // --- Challenge history from CompetitionResult ---
    const challengeHistory = results.map((r) => {
      // Extract tier from cohortId (e.g., "scout-2026-03-14" -> "Scout")
      const tierMatch = r.cohortId.match(
        /^(sprint|scout|ranger|veteran|elite|apex)/i
      );
      const tier = tierMatch
        ? tierMatch[1].charAt(0).toUpperCase() + tierMatch[1].slice(1).toLowerCase()
        : r.cohortId;

      const passed = r.fundedStatus != null || r.finalRank <= 5;

      return {
        tier,
        date: r.completedAt.toISOString().split("T")[0],
        result: passed ? ("Passed" as const) : ("Failed" as const),
        finalRank: r.finalRank,
        finalScore: r.finalScore,
        payoutUsd: r.payoutUsd,
      };
    });

    // --- Rank progression: last N cohort scores ---
    const recentScores = scores.slice(0, 8).reverse();
    const rankHistory = recentScores.map((s, i) => ({
      label: `W${i + 1}`,
      rank: 0, // We need rank within cohort — approximate from finalRank
      score: s.tournamentScore,
      cohortId: s.cohortId,
    }));

    // Try to fill in actual ranks from CompetitionResult
    const resultMap = new Map(results.map((r) => [r.cohortId, r]));
    for (const entry of rankHistory) {
      const matchingResult = resultMap.get(entry.cohortId);
      if (matchingResult) {
        entry.rank = matchingResult.finalRank;
      }
    }

    // --- World Cup record ---
    let worldCup = null;
    if (worldCupMatches.length > 0) {
      const wins = worldCupMatches.filter((m) => m.winner === wallet).length;
      const losses = worldCupMatches.filter(
        (m) => m.completedAt && m.winner !== wallet && m.winner != null
      ).length;

      // Determine best round reached
      const rounds = worldCupMatches.map((m) => m.round);
      const bestRound = rounds[0] ?? "Unknown";

      worldCup = {
        matchesPlayed: worldCupMatches.length,
        wins,
        losses,
        bestRound,
      };
    }

    return NextResponse.json({
      found: true,
      wallet,
      walletShort: wallet.slice(0, 4) + "..." + wallet.slice(-4),
      overallScore: Math.round(overallScore),
      seasonRank,
      streakDays,
      fundedStatus: hasFundedResult ? "qualified" : null,
      performance,
      earnedBadgeIds: uniqueBadgeIds,
      challengeHistory,
      rankHistory,
      worldCup,
      enrollmentCount: enrollments.length,
    });
  } catch (error) {
    console.error("[/api/profile] Error fetching profile data:", error);
    return NextResponse.json(
      { found: false, error: "Failed to fetch profile data" },
      { status: 500 }
    );
  }
}
