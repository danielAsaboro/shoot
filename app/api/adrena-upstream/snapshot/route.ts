import { getCompetitionSnapshotResponse } from "@/lib/competition/provider";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const wallet = request.nextUrl.searchParams.get("wallet") ?? undefined;
  const enrolledCohortId =
    request.nextUrl.searchParams.get("enrolledCohortId") ?? undefined;

  const response = await getCompetitionSnapshotResponse(wallet, enrolledCohortId);
  return NextResponse.json(response);
}
