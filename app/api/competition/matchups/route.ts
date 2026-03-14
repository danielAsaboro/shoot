import { getCompetitionSnapshotResponse } from "@/lib/competition/provider";
import { getDeskMembers } from "@/lib/db/queries";
import { deskDefinitions } from "@/lib/competition/desks";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const cohortId = request.nextUrl.searchParams.get("cohortId");

  if (!cohortId) {
    return NextResponse.json(
      { error: "Missing cohortId parameter" },
      { status: 400 }
    );
  }

  try {
    const response = await getCompetitionSnapshotResponse();
    const cohort = response.snapshot.cohorts.find((c) => c.id === cohortId);

    if (!cohort) {
      return NextResponse.json(
        { error: `Cohort ${cohortId} not found` },
        { status: 404 }
      );
    }

    // Build matchups from real standings (pair adjacent ranks)
    const eligible = cohort.standings.filter((s) => s.eligible);
    const matchups = [];
    for (let i = 0; i < eligible.length - 1; i += 2) {
      const a = eligible[i];
      const b = eligible[i + 1];
      matchups.push({
        id: `${cohortId}-match-${i / 2}`,
        traderA: a.wallet,
        traderB: b.wallet,
        displayNameA: a.displayName,
        displayNameB: b.displayName,
        scoreA: a.tournamentScore,
        scoreB: b.tournamentScore,
        winner: a.tournamentScore >= b.tournamentScore ? a.wallet : b.wallet,
        round: "round-1",
      });
    }

    // Build desk standings from DB memberships
    const deskStandings = [];
    for (const desk of deskDefinitions) {
      const members = await getDeskMembers(desk.id);
      if (members.length > 0) {
        const memberWallets = members.map((m) => m.wallet);
        const memberStandings = cohort.standings.filter((s) =>
          memberWallets.includes(s.wallet)
        );
        const avgScore =
          memberStandings.length > 0
            ? memberStandings.reduce((sum, s) => sum + s.tournamentScore, 0) /
              memberStandings.length
            : 0;
        deskStandings.push({
          deskId: desk.id,
          deskName: desk.name,
          memberCount: members.length,
          averageScore: avgScore,
          specialistType: desk.specialistType,
        });
      }
    }

    return NextResponse.json({
      cohortId,
      matchups,
      deskStandings,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
