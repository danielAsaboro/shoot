import { getCompetitionSnapshotResponse } from "@/lib/competition/provider";
import type { CompetitionSnapshotResponse } from "@/lib/competition/types";
import { NextRequest, NextResponse } from "next/server";

// ── Snapshot cache for graceful degradation ─────────────────────────────────
let cachedSnapshot: CompetitionSnapshotResponse | null = null;
let cachedAt: number = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * GET /api/competition/snapshot?wallet=...&enrolledCohortId=...
 */
export async function GET(request: NextRequest) {
  const wallet = request.nextUrl.searchParams.get("wallet") ?? undefined;
  const enrolledCohortId =
    request.nextUrl.searchParams.get("enrolledCohortId") ?? undefined;

  try {
    const response = await getCompetitionSnapshotResponse(
      wallet,
      enrolledCohortId
    );

    // Cache successful response for graceful degradation
    cachedSnapshot = response;
    cachedAt = Date.now();

    return NextResponse.json(response);
  } catch (error) {
    // Graceful degradation: serve stale cached data if available
    if (cachedSnapshot && Date.now() - cachedAt < CACHE_TTL_MS) {
      return NextResponse.json(cachedSnapshot, {
        headers: {
          "X-Data-Stale": "true",
          "X-Cached-At": new Date(cachedAt).toISOString(),
        },
      });
    }

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
