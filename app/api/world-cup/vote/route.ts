import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { matchId, voterWallet, votedFor } = body;

    if (!matchId || typeof matchId !== "string") {
      return NextResponse.json(
        { error: "matchId is required" },
        { status: 400 }
      );
    }
    if (!voterWallet || typeof voterWallet !== "string") {
      return NextResponse.json(
        { error: "voterWallet is required" },
        { status: 400 }
      );
    }
    if (!votedFor || typeof votedFor !== "string") {
      return NextResponse.json(
        { error: "votedFor is required" },
        { status: 400 }
      );
    }

    await prisma.spectatorVote.upsert({
      where: { matchId_voterWallet: { matchId, voterWallet } },
      update: { votedFor },
      create: { matchId, voterWallet, votedFor },
    });

    const count = await prisma.spectatorVote.count({ where: { matchId } });

    return NextResponse.json({
      matchId,
      totalVotes: count,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  const matchId = request.nextUrl.searchParams.get("matchId");

  if (matchId) {
    const groups = await prisma.spectatorVote.groupBy({
      by: ["votedFor"],
      where: { matchId },
      _count: { votedFor: true },
    });

    const votes: Record<string, number> = {};
    let total = 0;
    for (const g of groups) {
      votes[g.votedFor] = g._count.votedFor;
      total += g._count.votedFor;
    }

    return NextResponse.json({ matchId, totalVotes: total, votes });
  }

  // Return all match vote counts
  const groups = await prisma.spectatorVote.groupBy({
    by: ["matchId"],
    _count: { matchId: true },
  });

  const all: Record<string, { totalVotes: number }> = {};
  for (const g of groups) {
    all[g.matchId] = { totalVotes: g._count.matchId };
  }
  return NextResponse.json(all);
}
