import { runSybilDetection } from "@/lib/competition/sybil-workflow";
import { fetchPositions } from "@/lib/adrena/client";
import type { AdrenaPosition } from "@/lib/adrena/client";
import {
  getActiveCohorts,
  getEnrolledWalletsForCohort,
} from "@/lib/db/queries";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";

/**
 * POST /api/admin/sybil/batch-detect — Run sybil detection across all active cohorts
 */
export async function POST(request: NextRequest) {
  const authError = requireAdmin(request);
  if (authError) return authError;

  try {
    const cohorts = await getActiveCohorts();
    const results = [];

    for (const cohort of cohorts) {
      const wallets = await getEnrolledWalletsForCohort(cohort.id);
      const positionsByWallet = new Map<string, AdrenaPosition[]>();

      // Fetch positions for all enrolled wallets
      for (const wallet of wallets) {
        try {
          const positions = await fetchPositions(wallet);
          positionsByWallet.set(wallet, positions);
        } catch {
          positionsByWallet.set(wallet, []);
        }
      }

      const result = await runSybilDetection(
        cohort.id,
        wallets,
        positionsByWallet,
        cohort.startTime,
        cohort.endTime
      );

      results.push(result);
    }

    return NextResponse.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      cohorts: results,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
