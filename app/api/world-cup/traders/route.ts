import { NextResponse } from "next/server";
import { loadWorldCupTraders, loadDesks } from "@/lib/world-cup/data";

export async function GET() {
  const [traders, desks] = await Promise.all([
    loadWorldCupTraders(),
    loadDesks(),
  ]);

  return NextResponse.json({ traders, desks });
}
