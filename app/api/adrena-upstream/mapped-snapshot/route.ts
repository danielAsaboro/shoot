import { getCompetitionSnapshotResponse } from "@/lib/competition/provider";
import { NextResponse } from "next/server";

export async function GET() {
  const response = await getCompetitionSnapshotResponse();
  return NextResponse.json(response);
}
