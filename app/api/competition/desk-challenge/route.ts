/**
 * Desk Challenge API — "Desk Wars"
 *
 * POST: Create a desk-vs-desk challenge for a cohort.
 * GET: Fetch desk challenge results for a cohort.
 */

import { prisma } from "@/lib/db/client";
import {
  computeDeskStandings,
  resolveDeskMatchup,
} from "@/lib/competition/desks";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const cohortId = request.nextUrl.searchParams.get("cohortId");
  if (!cohortId) {
    return NextResponse.json({ error: "cohortId required" }, { status: 400 });
  }

  const challenges = await prisma.deskChallenge.findMany({
    where: { cohortId },
    orderBy: { scheduledAt: "desc" },
  });

  return NextResponse.json({ challenges });
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { cohortId, deskAId, deskBId } = body as {
    cohortId?: string;
    deskAId?: string;
    deskBId?: string;
  };

  if (!cohortId || !deskAId || !deskBId) {
    return NextResponse.json(
      { error: "cohortId, deskAId, and deskBId required" },
      { status: 400 }
    );
  }

  // Get current standings to compute scores
  const scores = await prisma.traderScore.findMany({
    where: { cohortId },
    orderBy: { tournamentScore: "desc" },
  });

  const standings = scores.map((s, i) => ({
    wallet: s.wallet,
    displayName: `${s.wallet.slice(0, 4)}...${s.wallet.slice(-4)}`,
    badge: "Trader",
    rank: i + 1,
    tournamentScore: s.tournamentScore,
    pnlPercent: s.pnlPercent,
    volumeUsd: s.volumeUsd,
    winRate: s.winRate,
    consistencyScore: s.consistencyScore,
    maxDrawdownPercent: s.maxDrawdownPercent,
    attainedAt: s.computedAt.toISOString(),
    eligible: true,
    questRewardPoints: 0,
    raffleTicketsAwarded: 0,
    tradeCount: s.tradeCount,
    activeDays: s.activeDays,
  }));

  const deskStandings = computeDeskStandings(standings, cohortId);
  const deskA = deskStandings.find((d) => d.desk.id === deskAId);
  const deskB = deskStandings.find((d) => d.desk.id === deskBId);

  if (!deskA || !deskB) {
    return NextResponse.json(
      { error: "One or both desks not found in standings" },
      { status: 404 }
    );
  }

  const result = resolveDeskMatchup(deskA, deskB);

  const challenge = await prisma.deskChallenge.create({
    data: {
      cohortId,
      deskAId,
      deskBId,
      scoreA: deskA.deskScore,
      scoreB: deskB.deskScore,
      winner: result.winner.id,
      scheduledAt: new Date(),
      completedAt: new Date(),
    },
  });

  return NextResponse.json({
    challenge,
    result: {
      winner: result.winner.name,
      margin: result.margin,
    },
  });
}
