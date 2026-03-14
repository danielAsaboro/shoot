import { NextRequest, NextResponse } from "next/server";
import { fetchPositions, type AdrenaPosition } from "@/lib/adrena/client";
import { getCohort } from "@/lib/db/queries";

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Closed position with guaranteed non-null pnl and exit_date. */
type ClosedPosition = AdrenaPosition & { exit_date: string; pnl: number };

/** Filter to closed positions within a time window, sorted chronologically by exit date. */
function closedPositionsInWindow(
  positions: AdrenaPosition[],
  start: Date,
  end: Date,
): ClosedPosition[] {
  const startMs = start.getTime();
  const endMs = end.getTime();

  return positions
    .filter((p): p is AdrenaPosition & { exit_date: string; pnl: number } => {
      if (p.status === "open" || p.exit_date === null || p.pnl === null) return false;
      const exitMs = new Date(p.exit_date).getTime();
      return exitMs >= startMs && exitMs <= endMs;
    })
    .sort((a, b) => new Date(a.exit_date).getTime() - new Date(b.exit_date).getTime());
}

/** Build cumulative equity points from closed positions. Starts at 0. */
function buildEquityHistory(
  closed: Array<{ pnl: number; exit_date: string }>,
): { points: number[]; timestamps: string[] } {
  const points: number[] = [0];
  const timestamps: string[] = [closed.length > 0 ? closed[0].exit_date : new Date().toISOString()];

  let cumulative = 0;
  for (const pos of closed) {
    cumulative += pos.pnl;
    points.push(cumulative);
    timestamps.push(pos.exit_date);
  }

  return { points, timestamps };
}

// ── GET handler ─────────────────────────────────────────────────────────────

/**
 * GET /api/competition/equity?wallet=...&cohortId=...
 *
 * Returns the cumulative P&L equity history for a wallet within a cohort's
 * time window. Each point is the running sum of closed-position PnL values.
 */
export async function GET(request: NextRequest) {
  const wallet = request.nextUrl.searchParams.get("wallet");
  const cohortId = request.nextUrl.searchParams.get("cohortId");

  if (!wallet || !cohortId) {
    return NextResponse.json(
      { error: "Missing required query params: wallet, cohortId" },
      { status: 400 },
    );
  }

  try {
    const cohort = await getCohort(cohortId);

    if (!cohort) {
      return NextResponse.json(
        { error: `Cohort "${cohortId}" not found` },
        { status: 404 },
      );
    }

    // Fetch positions from Adrena Data API
    const positions = await fetchPositions(wallet);

    // Filter to closed positions within the cohort window
    const closed = closedPositionsInWindow(positions, cohort.startTime, cohort.endTime);

    // Build cumulative equity curve
    const { points, timestamps } = buildEquityHistory(closed);

    return NextResponse.json({
      wallet,
      cohortId,
      points,
      timestamps,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
