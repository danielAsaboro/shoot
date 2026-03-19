import { prisma } from "@/lib/db/client";
import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/competition/narrative — Retrieve narrative beat history.
 *
 * Query params:
 *   cohortId (required) — The cohort to fetch beats for
 *   limit (optional, default 20, max 100)
 *   offset (optional, default 0)
 */
export async function GET(request: NextRequest) {
  const cohortId = request.nextUrl.searchParams.get("cohortId");
  if (!cohortId) {
    return NextResponse.json(
      { error: "cohortId query parameter is required." },
      { status: 400 }
    );
  }

  const limit = Math.min(
    100,
    Math.max(1, Number(request.nextUrl.searchParams.get("limit")) || 20)
  );
  const offset = Math.max(
    0,
    Number(request.nextUrl.searchParams.get("offset")) || 0
  );

  try {
    const [beats, total] = await Promise.all([
      prisma.narrativeBeat.findMany({
        where: { cohortId },
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
        select: {
          id: true,
          cohortId: true,
          type: true,
          headline: true,
          subtext: true,
          severity: true,
          createdAt: true,
        },
      }),
      prisma.narrativeBeat.count({ where: { cohortId } }),
    ]);

    return NextResponse.json({
      cohortId,
      beats,
      total,
      limit,
      offset,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
