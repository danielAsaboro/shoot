/**
 * Competition enrollment and receipt storage — DB-backed via API.
 *
 * All persistence flows through server API routes that write to PostgreSQL.
 * These client-side functions are async wrappers around fetch calls.
 */

import type { CompetitionEntryReceipt } from "./types.ts";

export async function loadCompetitionReceipts(
  wallet?: string | null
): Promise<CompetitionEntryReceipt[]> {
  if (!wallet) return [];
  try {
    const res = await fetch(
      `/api/competition/receipts?wallet=${encodeURIComponent(wallet)}`
    );
    if (!res.ok) return [];
    const data = await res.json();
    return (data.receipts ?? []) as CompetitionEntryReceipt[];
  } catch {
    return [];
  }
}

export async function loadPersistedEnrollment(
  wallet?: string | null
): Promise<string | null> {
  if (!wallet) return null;
  try {
    const res = await fetch(
      `/api/competition/enrollment?wallet=${encodeURIComponent(wallet)}`
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data.cohortId ?? null;
  } catch {
    return null;
  }
}

/**
 * Persist enrollment is now handled server-side via POST /api/competition/enroll.
 * This is a no-op kept for call-site compatibility during migration.
 */
export function persistEnrollment(
  _wallet: string,
  _cohortId: string | null
): void {
  // Enrollment is persisted server-side when POST /api/competition/enroll succeeds.
  // No client-side storage needed.
}

/**
 * Save receipt is now handled server-side via POST /api/competition/enroll.
 * This is a no-op kept for call-site compatibility during migration.
 */
export function saveCompetitionReceipt(
  _receipt: CompetitionEntryReceipt
): void {
  // Receipt is persisted server-side as part of the enrollment flow.
  // No client-side storage needed.
}
