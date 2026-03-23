/**
 * Server-side data loaders for World Cup trader and desk data.
 * Reads from the database instead of hardcoded TypeScript arrays.
 */

import { prisma } from "../db/client.ts";
import type { TraderRecord, DeskDefinition, AssetClassId } from "./types.ts";

export async function loadWorldCupTraders(
  division?: AssetClassId
): Promise<TraderRecord[]> {
  const where = division ? { specialization: division } : {};
  const rows = await prisma.worldCupTrader.findMany({ where });

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    alias: row.alias,
    specialization: row.specialization as AssetClassId,
    tag: row.tag,
    bio: row.bio,
    baseline: row.baseline as TraderRecord["baseline"],
    scenarioOverrides:
      (row.scenarioOverrides as TraderRecord["scenarioOverrides"]) ?? undefined,
    manualFlags: (row.manualFlags as TraderRecord["manualFlags"]) ?? undefined,
  }));
}

export async function loadDesks(
  cupId?: AssetClassId
): Promise<DeskDefinition[]> {
  const where = cupId ? { cupId } : {};
  const rows = await prisma.desk.findMany({ where });

  return rows.map((row) => ({
    id: row.id,
    cupId: row.cupId as AssetClassId,
    name: row.name,
    tier: row.tier as "Premier" | "Challenger",
    motto: row.motto,
    captainMission: row.captainMission,
    supporters: row.supporters,
  }));
}

export async function loadDeskAssignments(): Promise<Record<string, string>> {
  const memberships = await prisma.deskMembership.findMany();
  const assignments: Record<string, string> = {};
  for (const m of memberships) {
    assignments[m.wallet] = m.deskId;
  }
  return assignments;
}
