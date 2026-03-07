/**
 * Tier configuration module.
 *
 * Extracts challenge tier definitions into a dedicated file so they can be
 * imported without pulling in the full config dependency graph.
 */

import type { ChallengeTier, ChallengeTierId, SpecialistChallenge, SpecialistType } from "./types.ts";
import { challengeTiers, specialistChallenges } from "./config.ts";

export { challengeTiers, specialistChallenges };

/** Look up a tier by its ID. Returns undefined for unknown IDs. */
export function getTierById(id: string): ChallengeTier | undefined {
  return challengeTiers[id as ChallengeTierId];
}

/** Look up a specialist challenge by type. Returns undefined for unknown types. */
export function getSpecialistChallenge(type: string): SpecialistChallenge | undefined {
  return specialistChallenges[type as SpecialistType];
}
