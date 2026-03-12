import { fetchPoolStats, fetchLiquidityInfo } from "@/lib/adrena/client";
import { NextResponse } from "next/server";

export const revalidate = 20;

const SYMBOLS = ["BTCUSDT", "SOLUSDT", "JUPUSDT", "ETHUSDT", "BONKUSDT", "WIFUSDT"];

interface BinanceTicker {
  symbol: string;
  price: string;
}

const DISPLAY: Record<string, { label: string; decimals: number }> = {
  BTCUSDT:  { label: "BTC",  decimals: 0 },
  SOLUSDT:  { label: "SOL",  decimals: 2 },
  JUPUSDT:  { label: "JUP",  decimals: 3 },
  ETHUSDT:  { label: "ETH",  decimals: 0 },
  BONKUSDT: { label: "BONK", decimals: 8 },
  WIFUSDT:  { label: "WIF",  decimals: 3 },
};

export async function GET() {
  try {
    const symbolsParam = encodeURIComponent(JSON.stringify(SYMBOLS));

    const [poolStats, liquidityInfo, pricesRes] = await Promise.allSettled([
      fetchPoolStats(),
      fetchLiquidityInfo(),
      fetch(
        `https://api.binance.com/api/v3/ticker/price?symbols=${symbolsParam}`,
        { next: { revalidate: 20 } }
      ).then((r) => r.json() as Promise<BinanceTicker[]>),
    ]);

    const prices: Record<string, number> = {};
    if (pricesRes.status === "fulfilled" && Array.isArray(pricesRes.value)) {
      for (const t of pricesRes.value) {
        prices[t.symbol] = parseFloat(t.price);
      }
    }

    const assets = SYMBOLS.map((sym) => ({
      symbol: sym,
      label: DISPLAY[sym].label,
      price: prices[sym] ?? null,
      decimals: DISPLAY[sym].decimals,
    }));

    return NextResponse.json({
      aum:
        liquidityInfo.status === "fulfilled"
          ? liquidityInfo.value.totalPoolValueUsd
          : null,
      dailyVolume:
        poolStats.status === "fulfilled"
          ? poolStats.value.daily_volume_usd
          : null,
      btcPrice: prices["BTCUSDT"] ?? null,
      assets,
      fetchedAt: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 502 }
    );
  }
}
