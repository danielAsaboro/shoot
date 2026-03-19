import { updateQuestProgress, getQuestProgress } from "@/lib/db/queries";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const wallet = request.nextUrl.searchParams.get("wallet");
  if (!wallet) {
    return NextResponse.json({ error: "wallet is required" }, { status: 400 });
  }

  const progress = await getQuestProgress(wallet);
  return NextResponse.json({ progress });
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { wallet, questId, progress, completed } = body as {
    wallet?: string;
    questId?: string;
    progress?: number;
    completed?: boolean;
  };

  if (!wallet || !questId || progress === undefined) {
    return NextResponse.json(
      { error: "wallet, questId, and progress are required." },
      { status: 400 }
    );
  }

  const result = await updateQuestProgress(wallet, questId, progress, completed);
  return NextResponse.json({ result });
}
