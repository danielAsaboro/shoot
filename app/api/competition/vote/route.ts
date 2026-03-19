import { upsertVote, getVotesForMatch, getVoteCountsByMatch } from "@/lib/db/queries";
import { getCompetitionSnapshotResponse } from "@/lib/competition/provider";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const matchId = request.nextUrl.searchParams.get("matchId");
  const cohortId = request.nextUrl.searchParams.get("cohortId");

  if (!cohortId) {
    return NextResponse.json(
      { error: "Missing cohortId parameter" },
      { status: 400 }
    );
  }

  try {
    if (matchId) {
      // Single match vote stats
      const votes = await getVotesForMatch(matchId);
      const counts = await getVoteCountsByMatch(matchId);
      const topVoted = counts.sort((a, b) => b.count - a.count)[0];

      return NextResponse.json({
        matchId,
        votes: votes.length,
        favorite: topVoted
          ? { wallet: topVoted.wallet, votes: topVoted.count }
          : null,
      });
    }

    // All matchups — aggregate crowd favorites
    const response = await getCompetitionSnapshotResponse();
    const cohort = response.snapshot.cohorts.find((c) => c.id === cohortId);

    if (!cohort) {
      return NextResponse.json(
        { error: `Cohort ${cohortId} not found` },
        { status: 404 }
      );
    }

    const matchups = cohort.matchups ?? [];
    const favorites = [];
    for (const match of matchups) {
      const counts = await getVoteCountsByMatch(match.id);
      const totalVotes = counts.reduce((sum, c) => sum + c.count, 0);
      if (totalVotes >= 5) {
        const top = counts.sort((a, b) => b.count - a.count)[0];
        favorites.push({
          matchId: match.id,
          wallet: top.wallet,
          votes: top.count,
          totalVotes,
        });
      }
    }

    return NextResponse.json({
      cohortId,
      crowdFavorites: favorites,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { matchId, voterWallet, votedFor } = body;

    if (!matchId || !voterWallet || !votedFor) {
      return NextResponse.json(
        { error: "Missing matchId, voterWallet, or votedFor" },
        { status: 400 }
      );
    }

    const vote = await upsertVote(matchId, voterWallet, votedFor);

    return NextResponse.json({
      success: true,
      vote: {
        matchId: vote.matchId,
        voterWallet: vote.voterWallet,
        votedFor: vote.votedFor,
        timestamp: vote.createdAt.getTime(),
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
