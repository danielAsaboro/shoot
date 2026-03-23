/**
 * Cron Endpoint: Rotate Cohorts
 *
 * Called every 15 minutes (via external scheduler such as Railway cron).
 * Checks for expired cohorts and creates new ones based on the
 * always-on rotation schedule. All state is persisted to PostgreSQL.
 */

import { NextResponse } from "next/server";
import { getCohortsToCreate } from "@/lib/competition/scheduler";
import { getActiveCohorts, createCohort } from "@/lib/db/queries";
import { competitionConfig } from "@/lib/competition/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  // Verify cron secret if configured (prevent public invocation)
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const now = new Date();

  const activeCohorts = await getActiveCohorts();
  const activeCohortIds = activeCohorts.map((c) => c.id);

  const pending = getCohortsToCreate(activeCohortIds, now);

  if (pending.length === 0) {
    return NextResponse.json({
      status: "no_action",
      message: "All scheduled cohorts are active",
      checkedAt: now.toISOString(),
    });
  }

  for (const cohort of pending) {
    const preset = competitionConfig.presets.find(
      (p) => p.id === cohort.presetId
    );
    await createCohort({
      id: cohort.id,
      name: cohort.name,
      presetId: cohort.presetId,
      state: "upcoming",
      startTime: new Date(cohort.startTime),
      endTime: new Date(cohort.endTime),
      narrative: preset?.tagline ?? "",
      rewardPoolUsd: Math.round(
        cohort.entryFeeUsd * cohort.participantCap * 0.6
      ),
      entryFeeUsd: cohort.entryFeeUsd,
      participantCap: cohort.participantCap,
    });
  }

  console.log(
    `[cron/rotate-cohorts] Created ${pending.length} cohort(s):`,
    pending.map((c) => `${c.id} (${c.tierId}, ${c.cadenceHours}h)`)
  );

  return NextResponse.json({
    status: "cohorts_scheduled",
    scheduled: pending,
    checkedAt: now.toISOString(),
  });
}
