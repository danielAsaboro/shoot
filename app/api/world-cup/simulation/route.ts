import { createSeasonSimulation } from "@/lib/world-cup/engine";
import { defaultGuardrails, defaultWeights } from "@/lib/world-cup/types";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const weights = body.weights ?? defaultWeights;
    const guardrails = body.guardrails ?? defaultGuardrails;

    const simulation = createSeasonSimulation({ weights, guardrails });
    return NextResponse.json({ simulation });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
