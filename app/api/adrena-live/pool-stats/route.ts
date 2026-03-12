import { fetchPoolStats, fetchLiquidityInfo } from "@/lib/adrena/client";
import { NextResponse } from "next/server";

/**
 * GET /api/adrena-live/pool-stats
 *
 * Returns real-time pool statistics and liquidity info from datapi.adrena.trade.
 * Used by the competition hub to show live protocol context.
 */
export async function GET() {
  try {
    const [poolStats, liquidityInfo] = await Promise.all([
      fetchPoolStats(),
      fetchLiquidityInfo(),
    ]);

    return NextResponse.json({
      pool: poolStats,
      liquidity: liquidityInfo,
      fetchedAt: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 502 }
    );
  }
}
