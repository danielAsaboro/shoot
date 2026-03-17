import { getWorldCupSnapshot, type WorldCupMode } from "@/lib/world-cup/provider";
import { defaultGuardrails, defaultWeights } from "@/lib/world-cup/types";
import type { AssetClassId, ScenarioId } from "@/lib/world-cup/types";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const cupId = (request.nextUrl.searchParams.get("cupId") ?? "crypto") as AssetClassId;
  const scenarioId = (request.nextUrl.searchParams.get("scenarioId") ?? "bubble") as ScenarioId;
  const walletAddress = request.nextUrl.searchParams.get("wallet") ?? undefined;
  const mode = (request.nextUrl.searchParams.get("mode") ?? "simulation") as WorldCupMode;

  const weightsParam = request.nextUrl.searchParams.get("weights");
  const guardrailsParam = request.nextUrl.searchParams.get("guardrails");

  const weights = weightsParam ? JSON.parse(weightsParam) : defaultWeights;
  const guardrails = guardrailsParam ? JSON.parse(guardrailsParam) : defaultGuardrails;

  try {
    const snapshot = getWorldCupSnapshot({
      cupId,
      scenarioId,
      weights,
      guardrails,
      walletAddress,
      mode,
    });
    return NextResponse.json(snapshot);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
