import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { requireAdmin } from "@/lib/auth/admin";

/**
 * POST /api/admin/challenge — Create a challenge on-chain.
 *
 * In production, this would be called by the authority multisig.
 * The actual on-chain transaction is built and signed by the admin client.
 * This endpoint records the challenge metadata in the database.
 */
export async function POST(request: NextRequest) {
  const authError = requireAdmin(request);
  if (authError) return authError;

  try {
    const body = await request.json();
    const {
      challengeId,
      tierName,
      entryFeeUsdc,
      profitTargetBps,
      maxDrawdownBps,
      dailyLossLimitBps,
      durationSeconds,
      minCapitalUsd,
      participantCap,
      txSignature,
    } = body as {
      challengeId: string;
      tierName: string;
      entryFeeUsdc: number;
      profitTargetBps: number;
      maxDrawdownBps: number;
      dailyLossLimitBps: number;
      durationSeconds: number;
      minCapitalUsd: number;
      participantCap: number;
      txSignature: string;
    };

    if (!challengeId || !tierName || !txSignature) {
      return NextResponse.json(
        { error: "challengeId, tierName, and txSignature are required" },
        { status: 400 }
      );
    }

    // The on-chain challenge was created via the Anchor program.
    // Record metadata for the off-chain scoring engine.
    const record = await prisma.challenge.create({
      data: {
        challengeId,
        tierName,
        entryFeeUsdc,
        profitTargetBps,
        maxDrawdownBps,
        dailyLossLimitBps,
        durationSeconds,
        minCapitalUsd,
        participantCap,
        txSignature,
      },
    });

    return NextResponse.json({ success: true, challenge: record });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
