import { getGroupStageSnapshot, type WorldCupMode } from "@/lib/world-cup/provider";
import { defaultGuardrails, defaultWeights } from "@/lib/world-cup/types";
import type { AssetClassId, ScenarioId } from "@/lib/world-cup/types";
import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/world-cup/redemption — Retrieve the multi-round redemption bracket.
 *
 * Query params:
 *   cupId (default "crypto")
 *   scenarioId (default "group_stage")
 *   mode (default "simulation", or "live" for real Adrena data)
 *   weights, guardrails (optional JSON overrides)
 *   wallet (optional viewer wallet)
 */
export async function GET(request: NextRequest) {
  const cupId = (request.nextUrl.searchParams.get("cupId") ?? "crypto") as AssetClassId;
  const scenarioId = (request.nextUrl.searchParams.get("scenarioId") ?? "group_stage") as ScenarioId;
  const walletAddress = request.nextUrl.searchParams.get("wallet") ?? undefined;
  const mode = (request.nextUrl.searchParams.get("mode") ?? "simulation") as WorldCupMode;

  const weightsParam = request.nextUrl.searchParams.get("weights");
  const guardrailsParam = request.nextUrl.searchParams.get("guardrails");

  const weights = weightsParam ? JSON.parse(weightsParam) : defaultWeights;
  const guardrails = guardrailsParam ? JSON.parse(guardrailsParam) : defaultGuardrails;

  try {
    const snapshot = await getGroupStageSnapshot({
      cupId,
      scenarioId,
      weights,
      guardrails,
      walletAddress,
      mode,
    });

    const { redemptionBracket } = snapshot.fullBracket;

    return NextResponse.json({
      cupId,
      mode,
      redemptionBracket,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
