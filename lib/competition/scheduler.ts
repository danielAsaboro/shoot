/**
 * Cohort Scheduler — Always-On Competition Rotation
 *
 * Automatically creates new competition cohorts when existing ones expire.
 * Supports multiple cadences running in parallel:
 *
 * - Sprint (48h) — micro-competition, always-on
 * - Scout (7d) — beginner-friendly weekly rotation
 * - Ranger (10d) — intermediate rotation
 * - Carry (72h) — RWA-focused rotating cohorts
 *
 * Called via Vercel cron (/api/cron/rotate-cohorts) every 15 minutes.
 */

import type { ChallengeTierId } from "./types.ts";

// Tier display names — kept inline to avoid importing config.ts
// (which pulls in client-side code that breaks server-only cron routes).
const TIER_NAMES: Record<string, string> = {
  sprint: "Sprint",
  scout: "Scout",
  ranger: "Ranger",
  veteran: "Veteran",
  elite: "Elite",
  apex: "Apex",
};

// ── Schedule Configuration ──────────────────────────────────────────────────

export interface CohortScheduleConfig {
  /** Tier to use for auto-created cohorts. */
  tierId: ChallengeTierId;
  /** Preset ID from competitionConfig.presets. */
  presetId: string;
  /** How often a new cohort starts (hours). Matches tier durationDays × 24. */
  cadenceHours: number;
  /** Entry fee override (null = use tier default). */
  entryFeeUsd: number;
  /** Participant cap per cohort. */
  participantCap: number;
  /** Whether this schedule is active. */
  enabled: boolean;
}

export const DEFAULT_SCHEDULES: CohortScheduleConfig[] = [
  {
    tierId: "sprint",
    presetId: "crypto-impulse",
    cadenceHours: 48,
    entryFeeUsd: 1,
    participantCap: 256,
    enabled: true,
  },
  {
    tierId: "scout",
    presetId: "macro-sprint",
    cadenceHours: 168, // 7 days
    entryFeeUsd: 2,
    participantCap: 128,
    enabled: true,
  },
  {
    tierId: "ranger",
    presetId: "carry-breaker",
    cadenceHours: 240, // 10 days
    entryFeeUsd: 5,
    participantCap: 96,
    enabled: true,
  },
];

// ── Cohort ID Generation ────────────────────────────────────────────────────

function formatCohortId(tierId: string, date: Date): string {
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  const hour = String(date.getUTCHours()).padStart(2, "0");
  return `cohort-${tierId}-${month}${day}-${hour}`;
}

function formatCohortName(tierId: string, presetId: string, date: Date): string {
  const tierLabel = TIER_NAMES[tierId] ?? tierId;
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${tierLabel} ${presetId.replace("-", " ")} ${month}.${day}`;
}

// ── Scheduling Logic ────────────────────────────────────────────────────────

export interface PendingCohort {
  id: string;
  name: string;
  presetId: string;
  tierId: ChallengeTierId;
  startTime: string;
  endTime: string;
  entryFeeUsd: number;
  participantCap: number;
  cadenceHours: number;
}

/**
 * Given current active cohorts and schedule configs, determine which new
 * cohorts need to be created to maintain always-on rotation.
 *
 * A new cohort is created when:
 * 1. No active (live/upcoming) cohort exists for the schedule's tier+preset
 * 2. The most recent cohort for that schedule is past its midpoint
 *
 * @param activeCohortIds - IDs of currently live or upcoming cohorts
 * @param now - Current time (defaults to Date.now)
 * @param schedules - Schedule configs to evaluate
 * @returns Array of cohorts that should be created
 */
export function getCohortsToCreate(
  activeCohortIds: string[],
  now: Date = new Date(),
  schedules: CohortScheduleConfig[] = DEFAULT_SCHEDULES
): PendingCohort[] {
  const pending: PendingCohort[] = [];
  const nowMs = now.getTime();

  for (const schedule of schedules) {
    if (!schedule.enabled) continue;

    // Check if there's already an active cohort for this tier
    const hasActive = activeCohortIds.some((id) => id.includes(schedule.tierId));
    if (hasActive) continue;

    // Create next cohort starting now
    const startTime = new Date(nowMs);
    const endTime = new Date(nowMs + schedule.cadenceHours * 60 * 60 * 1000);

    const cohortId = formatCohortId(schedule.tierId, startTime);
    const cohortName = formatCohortName(schedule.tierId, schedule.presetId, startTime);

    pending.push({
      id: cohortId,
      name: cohortName,
      presetId: schedule.presetId,
      tierId: schedule.tierId as ChallengeTierId,
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
      entryFeeUsd: schedule.entryFeeUsd,
      participantCap: schedule.participantCap,
      cadenceHours: schedule.cadenceHours,
    });
  }

  return pending;
}
