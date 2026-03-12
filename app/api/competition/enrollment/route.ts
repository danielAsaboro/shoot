import { getEnrollmentForWallet } from "@/lib/db/queries";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const wallet = request.nextUrl.searchParams.get("wallet");
  if (!wallet) {
    return NextResponse.json({ error: "wallet is required" }, { status: 400 });
  }

  const enrollment = await getEnrollmentForWallet(wallet);
  return NextResponse.json({
    cohortId: enrollment?.cohortId ?? null,
    txSignature: enrollment?.txSignature ?? null,
    enrolledAt: enrollment?.enrolledAt?.toISOString() ?? null,
  });
}
