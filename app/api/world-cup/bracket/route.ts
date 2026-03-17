import { createFinalsBracket, type WorldCupData } from "@/lib/world-cup/engine";
import { defaultGuardrails, defaultWeights } from "@/lib/world-cup/types";
import type { ScenarioId } from "@/lib/world-cup/types";
import { loadWorldCupTraders, loadDesks } from "@/lib/world-cup/data";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const scenarioId = (request.nextUrl.searchParams.get("scenarioId") ?? "finals") as ScenarioId;
  const walletAddress = request.nextUrl.searchParams.get("wallet") ?? undefined;

  try {
    const [traders, desks] = await Promise.all([loadWorldCupTraders(), loadDesks()]);
    const data: WorldCupData = { traders, desks };

    const bracket = createFinalsBracket({
      scenarioId,
      weights: defaultWeights,
      guardrails: defaultGuardrails,
      walletAddress,
      data,
    });
    return NextResponse.json({ bracket });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
