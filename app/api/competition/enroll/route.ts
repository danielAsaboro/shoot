import { adrenaLiveAdapter } from "@/lib/competition/adrena-live-adapter";
import { enrollTrader, getCohort } from "@/lib/db/queries";
import { processQuestEvent } from "@/lib/competition/quest-emitter";
import {
  verifyEnrollmentTransaction,
  usdToUsdcAtoms,
} from "@/lib/solana/verify-tx";
import { findChallengePda, findVaultPda } from "@/lib/solana/program";
import { checkWalletAge } from "@/lib/solana/wallet-age";
import { PublicKey } from "@solana/web3.js";
import { NextRequest, NextResponse } from "next/server";

// Entry fees that require 30-day wallet age (Elite = $25, Apex = $50)
const WALLET_AGE_REQUIRED_FEE_THRESHOLD = 25;

// ── Rate Limiting ───────────────────────────────────────────────────────────
// Simple in-memory rate limiter: max 3 enrollments per IP per hour.
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_MAX = 3;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }

  if (entry.count >= RATE_LIMIT_MAX) return false;
  entry.count++;
  return true;
}

const PROGRAM_AUTHORITY = process.env.NEXT_PUBLIC_PROGRAM_AUTHORITY ?? "";

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { wallet, cohortId, txSignature, startingEquity } = body as {
    wallet?: string;
    cohortId?: string;
    txSignature?: string;
    startingEquity?: number;
  };

  // Rate limit check
  const clientIp =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown";
  if (!checkRateLimit(clientIp)) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Maximum 3 enrollments per hour." },
      { status: 429 }
    );
  }

  if (!wallet || !cohortId || !txSignature) {
    return NextResponse.json(
      { error: "wallet, cohortId, and txSignature are required." },
      { status: 400 }
    );
  }

  try {
    const cohort = await getCohort(cohortId);
    if (!cohort) {
      return NextResponse.json(
        { error: `Cohort ${cohortId} not found.` },
        { status: 404 }
      );
    }

    // ── Progressive KYC: wallet age check for high-tier challenges ───
    if (cohort.entryFeeUsd >= WALLET_AGE_REQUIRED_FEE_THRESHOLD) {
      const ageCheck = await checkWalletAge(wallet);
      if (!ageCheck.eligible) {
        return NextResponse.json({ error: ageCheck.reason }, { status: 403 });
      }
    }

    // ── On-chain transaction verification ──────────────────────────────
    // Verify the entry fee was actually paid before accepting enrollment.
    if (PROGRAM_AUTHORITY) {
      const authority = new PublicKey(PROGRAM_AUTHORITY);
      const [challengePda] = findChallengePda(authority, cohortId);
      const [vaultPda] = findVaultPda(challengePda);

      const verification = await verifyEnrollmentTransaction({
        txSignature,
        expectedPayer: wallet,
        expectedVault: vaultPda.toBase58(),
        expectedUsdc: usdToUsdcAtoms(cohort.entryFeeUsd),
      });

      if (!verification.verified) {
        return NextResponse.json(
          { error: `Transaction verification failed: ${verification.reason}` },
          { status: 400 }
        );
      }
    }

    // Persist enrollment to DB.
    // startingEquity is snapshotted at enrollment and becomes the immutable
    // ROI denominator — never updated on subsequent upserts.
    await enrollTrader(wallet, cohortId, txSignature, startingEquity);

    // Emit quest event for enrollment (fire-and-forget)
    processQuestEvent(wallet, "challenge_start").catch(() => {});

    const snapshot = await adrenaLiveAdapter.enrollTrader({ wallet, cohortId });
    return NextResponse.json({ snapshot });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
