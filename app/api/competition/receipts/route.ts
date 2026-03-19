import { getEnrollmentsByWallet } from "@/lib/db/queries";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const wallet = request.nextUrl.searchParams.get("wallet");
  if (!wallet) {
    return NextResponse.json({ error: "wallet is required" }, { status: 400 });
  }

  const enrollments = await getEnrollmentsByWallet(wallet);
  const receipts = enrollments.map((e) => ({
    cohortId: e.cohortId,
    createdAt: e.enrolledAt.toISOString(),
    lamports: 0, // Historical lamport amount not tracked in DB; entry fee tracked at cohort level
    signature: e.txSignature ?? "",
    wallet: e.wallet,
  }));

  return NextResponse.json({ receipts });
}
