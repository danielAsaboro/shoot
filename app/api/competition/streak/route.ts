import { updateStreak, getStreak } from "@/lib/db/queries";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const wallet = request.nextUrl.searchParams.get("wallet");
  if (!wallet) {
    return NextResponse.json({ error: "wallet is required" }, { status: 400 });
  }

  const streak = await getStreak(wallet);
  return NextResponse.json({ streak });
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { wallet, streakDays, lastActivityDate } = body as {
    wallet?: string;
    streakDays?: number;
    lastActivityDate?: string;
  };

  if (!wallet || streakDays === undefined || !lastActivityDate) {
    return NextResponse.json(
      { error: "wallet, streakDays, and lastActivityDate are required." },
      { status: 400 }
    );
  }

  const result = await updateStreak(wallet, streakDays, lastActivityDate);
  return NextResponse.json({ result });
}
