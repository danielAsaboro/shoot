import { fetchPositions } from "@/lib/adrena/client";
import { computeMetricsFromPositions } from "@/lib/adrena/metrics";
import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/adrena-live/positions?wallet=<address>&windowStart=<iso>&windowEnd=<iso>
 *
 * Fetches real positions from datapi.adrena.trade for a given wallet,
 * computes competition metrics within the specified time window, and
 * returns both the raw positions and computed performance.
 */
export async function GET(request: NextRequest) {
  const wallet = request.nextUrl.searchParams.get("wallet");
  if (!wallet) {
    return NextResponse.json(
      { error: "wallet parameter required" },
      { status: 400 }
    );
  }

  const windowStartParam = request.nextUrl.searchParams.get("windowStart");
  const windowEndParam = request.nextUrl.searchParams.get("windowEnd");
  const limit = Number(request.nextUrl.searchParams.get("limit") ?? "500");

  const windowStart = windowStartParam
    ? new Date(windowStartParam)
    : new Date(Date.now() - 14 * 24 * 60 * 60 * 1000); // default: last 14 days
  const windowEnd = windowEndParam ? new Date(windowEndParam) : new Date();

  try {
    const positions = await fetchPositions(wallet, limit);
    const metrics = computeMetricsFromPositions(
      positions,
      windowStart,
      windowEnd
    );

    const closedInWindow = positions.filter((p) => {
      if (p.status !== "close" && p.status !== "liquidate") return false;
      if (!p.exit_date) return false;
      const exitMs = new Date(p.exit_date).getTime();
      return exitMs >= windowStart.getTime() && exitMs <= windowEnd.getTime();
    });

    return NextResponse.json({
      wallet,
      window: {
        start: windowStart.toISOString(),
        end: windowEnd.toISOString(),
      },
      totalPositions: positions.length,
      closedInWindow: closedInWindow.length,
      metrics,
      positions: closedInWindow.slice(0, 20), // cap response size
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 502 }
    );
  }
}
