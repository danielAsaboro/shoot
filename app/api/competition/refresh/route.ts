import { adrenaLiveAdapter } from "@/lib/competition/adrena-live-adapter";
import { NextResponse } from "next/server";
import {
  notifyLeaderboardChange,
  notifySybilAlert,
} from "@/lib/notifications/discord-webhook";

/**
 * POST /api/competition/refresh
 *
 * Recomputes competition scores for all live cohorts by fetching fresh
 * position data from datapi.adrena.trade. Returns the updated snapshot.
 *
 * Called every 5 minutes by cron-job.org (POST request).
 * Configure at: https://cron-job.org → URL: https://<domain>/api/competition/refresh
 * Method: POST, Schedule: every 5 minutes.
 */

let lastRefreshAt: string | null = null;
let lastRefreshDurationMs: number | null = null;

export async function POST() {
  const start = Date.now();

  try {
    const snapshot = await adrenaLiveAdapter.getSnapshot();
    const durationMs = Date.now() - start;

    lastRefreshAt = new Date().toISOString();
    lastRefreshDurationMs = durationMs;

    const activeCohorts = snapshot.cohorts.filter((c) => c.state === "live");
    const totalTraders = activeCohorts.reduce(
      (sum, c) => sum + (c.standings?.length ?? 0),
      0
    );

    // Fire-and-forget Discord notifications for active cohorts
    for (const cohort of activeCohorts) {
      const top3 = (cohort.standings ?? [])
        .filter((s) => s.eligible)
        .slice(0, 3)
        .map((s) => ({
          rank: s.rank,
          displayName: s.displayName,
          score: s.tournamentScore,
          pnlPercent: s.pnlPercent,
        }));
      if (top3.length > 0) {
        void notifyLeaderboardChange({ cohortName: cohort.name, topThree: top3 });
      }

      // Notify ops of any sybil flags
      const flagged = (cohort.abuseResults ?? []).filter((a) => !a.eligible);
      if (flagged.length > 0) {
        void notifySybilAlert({
          cohortId: cohort.id,
          flaggedCount: flagged.length,
          clusters: flagged.map((f) => ({
            wallets: [f.wallet],
            reason: f.reason ?? "Policy violation",
          })),
        });
      }
    }

    return NextResponse.json({
      status: "ok",
      refreshedAt: lastRefreshAt,
      durationMs,
      activeCohorts: activeCohorts.length,
      totalTraders,
      cohorts: activeCohorts.map((c) => ({
        id: c.id,
        name: c.name,
        traders: c.standings?.length ?? 0,
        topScore: c.standings?.[0]?.tournamentScore ?? 0,
      })),
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: "error",
        error: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - start,
      },
      { status: 502 }
    );
  }
}

/** GET /api/competition/refresh — returns last refresh status without triggering a new one. */
export async function GET() {
  return NextResponse.json({
    lastRefreshAt,
    lastRefreshDurationMs,
  });
}
