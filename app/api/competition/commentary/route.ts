import { getRecentBeats } from "@/lib/db/queries";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const cohortId = request.nextUrl.searchParams.get("cohortId");

  if (!cohortId) {
    return NextResponse.json(
      { error: "Missing cohortId parameter" },
      { status: 400 }
    );
  }

  try {
    const beats = await getRecentBeats(cohortId, 30);
    const commentaryFeed = {
      beats: beats.map((b) => ({
        type: b.type,
        headline: b.headline,
        subtext: b.subtext,
        severity: b.severity,
        timestamp: b.createdAt.getTime(),
        cohortId: b.cohortId,
      })),
    };

    return NextResponse.json({
      cohortId,
      commentaryFeed,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
