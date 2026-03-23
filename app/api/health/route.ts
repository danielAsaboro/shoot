import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";

export const dynamic = "force-dynamic";

export async function GET() {
  const start = Date.now();
  let dbOk = false;

  try {
    await prisma.$queryRaw`SELECT 1`;
    dbOk = true;
  } catch {
    // db unreachable
  }

  const latencyMs = Date.now() - start;

  return NextResponse.json(
    {
      status: dbOk ? "healthy" : "degraded",
      db: dbOk,
      latency_ms: latencyMs,
      timestamp: new Date().toISOString(),
    },
    { status: dbOk ? 200 : 503 }
  );
}
