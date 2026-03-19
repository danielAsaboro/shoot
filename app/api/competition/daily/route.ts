import { NextResponse } from "next/server";
import { selectDailyMissions } from "@/lib/competition/daily-missions";

export async function GET() {
  const today = new Date();
  const missions = selectDailyMissions(today);

  return NextResponse.json({
    date: today.toISOString().slice(0, 10),
    missions: missions.map((m) => ({
      type: m.type,
      name: m.name,
      description: m.description,
    })),
  });
}
