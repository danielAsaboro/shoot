/**
 * Server-side Quest Processor
 *
 * Processes quest-relevant events from the competition pipeline and persists
 * progress directly to the database. Unlike the client-side QuestEngine which
 * uses fetch() to API routes, this processor uses direct Prisma queries.
 */

import { getQuestProgress, updateQuestProgress } from "../db/queries.ts";
import { QUEST_CATALOG, type QuestEvent } from "./quests.ts";

/**
 * Process a quest-triggering event for a wallet. Increments progress for
 * all matching quests and persists to the database.
 */
export async function processQuestEvent(
  wallet: string,
  event: QuestEvent
): Promise<void> {
  const existingProgress = await getQuestProgress(wallet);
  const progressMap = new Map(
    existingProgress.map((p) => [p.questId, p.progress])
  );

  for (const quest of QUEST_CATALOG) {
    if (!quest.triggers.includes(event)) continue;

    const current = progressMap.get(quest.id) ?? 0;
    if (current >= quest.target) continue;

    const newProgress = current + 1;
    const completed = newProgress >= quest.target;

    await updateQuestProgress(wallet, quest.id, newProgress, completed);
  }
}

/**
 * Emit quest events after a challenge evaluation.
 *
 * Call this from the score refresh pipeline after evaluating a trader's
 * challenge performance.
 */
export async function emitChallengeQuestEvents(params: {
  wallet: string;
  passed: boolean;
  hadPriorFailure: boolean;
  tierName: string;
  maxDrawdownPercent: number;
  cumulativeVolumeUsd: number;
  specialistType?: string;
}): Promise<void> {
  const {
    wallet,
    passed,
    hadPriorFailure,
    tierName,
    maxDrawdownPercent,
    cumulativeVolumeUsd,
    specialistType,
  } = params;

  if (passed) {
    await processQuestEvent(wallet, "challenge_pass");

    if (hadPriorFailure) {
      await processQuestEvent(wallet, "challenge_pass_after_fail");
    }

    // Elite tier with disciplined drawdown (< 3%)
    if (
      (tierName === "elite" || tierName === "apex") &&
      maxDrawdownPercent < 3
    ) {
      await processQuestEvent(wallet, "challenge_pass_elite_disciplined");
    }
  }

  // Volume threshold: 100K cumulative
  if (cumulativeVolumeUsd >= 100_000) {
    await processQuestEvent(wallet, "volume_threshold");
  }

  // Specialist track events
  if (specialistType === "metals") {
    await processQuestEvent(wallet, "challenge_start_metals");
  } else if (specialistType === "energy") {
    await processQuestEvent(wallet, "challenge_start_energy");
  }
}
