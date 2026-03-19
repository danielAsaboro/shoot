import { NextRequest, NextResponse } from "next/server";
import { getCohort, getEnrolledWalletsForCohort } from "@/lib/db/queries";
import {
  selectDailyMissions,
  evaluateBestRoi,
  evaluateMostTrades,
  evaluateHighestVolume,
  evaluateBestWinRate,
} from "@/lib/competition/daily-missions";
import type { DailyMissionType } from "@/lib/competition/daily-missions";
import { fetchPositions } from "@/lib/adrena/client";
import type { AdrenaPosition } from "@/lib/adrena/client";

// ── Evaluation dispatch ──────────────────────────────────────────────────────

const EVALUATORS: Record<
  string,
  (
    positions: Map<string, AdrenaPosition[]>,
    start: Date,
    end: Date,
  ) => { wallet: string; value: number; rank: number }[]
> = {
  evaluateBestRoi,
  evaluateMostTrades,
  evaluateHighestVolume,
  evaluateBestWinRate,
};

// ── Route handler ────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { cohortId } = body as { cohortId?: string };
  if (!cohortId) {
    return NextResponse.json(
      { error: "cohortId is required." },
      { status: 400 },
    );
  }

  // ── Read enrolled wallets from database ─────────────────────────────────────

  const cohort = await getCohort(cohortId);
  if (!cohort) {
    return NextResponse.json(
      { error: `Cohort "${cohortId}" not found.` },
      { status: 404 },
    );
  }
  const enrolledWallets = await getEnrolledWalletsForCohort(cohortId);

  // ── Fetch positions for each wallet ────────────────────────────────────────

  const positionsMap = new Map<string, AdrenaPosition[]>();
  const fetchErrors: string[] = [];

  await Promise.all(
    enrolledWallets.map(async (wallet) => {
      try {
        const positions = await fetchPositions(wallet);
        positionsMap.set(wallet, positions);
      } catch (err) {
        fetchErrors.push(
          `${wallet}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }),
  );

  // ── Determine today's window (UTC day) ─────────────────────────────────────

  const now = new Date();
  const windowStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const windowEnd = new Date(windowStart.getTime() + 86_400_000);

  // ── Evaluate each active mission ───────────────────────────────────────────

  const missions = selectDailyMissions(now);
  const results = missions.map((mission) => {
    const evaluator = EVALUATORS[mission.evaluateFn];
    const leaders = evaluator
      ? evaluator(positionsMap, windowStart, windowEnd)
      : [];

    return {
      type: mission.type as DailyMissionType,
      name: mission.name,
      leaders: leaders.slice(0, 10), // top 10
    };
  });

  return NextResponse.json({
    date: windowStart.toISOString().slice(0, 10),
    cohortId,
    results,
    ...(fetchErrors.length > 0 ? { warnings: fetchErrors } : {}),
  });
}
