import { createCupLeaderboard, type WorldCupData } from "@/lib/world-cup/engine";
import { defaultGuardrails, defaultWeights } from "@/lib/world-cup/types";
import type { AssetClassId, ScenarioId } from "@/lib/world-cup/types";
import { loadWorldCupTraders, loadDesks } from "@/lib/world-cup/data";
import { loadLiveWorldCupData } from "@/lib/world-cup/live-adapter";
import type { WorldCupMode } from "@/lib/world-cup/provider";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const cupId = (request.nextUrl.searchParams.get("cupId") ?? "crypto") as AssetClassId;
  const scenarioId = (request.nextUrl.searchParams.get("scenarioId") ?? "bubble") as ScenarioId;
  const walletAddress = request.nextUrl.searchParams.get("wallet") ?? undefined;
  const mode = (request.nextUrl.searchParams.get("mode") ?? "simulation") as WorldCupMode;

  try {
    let data: WorldCupData;
    if (mode === "live") {
      data = await loadLiveWorldCupData(cupId);
    } else {
      const [traders, desks] = await Promise.all([loadWorldCupTraders(), loadDesks()]);
      data = { traders, desks };
    }

    const leaderboard = createCupLeaderboard({
      cupId,
      scenarioId,
      weights: defaultWeights,
      guardrails: defaultGuardrails,
      walletAddress,
      data,
    });
    return NextResponse.json({ leaderboard, mode });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
