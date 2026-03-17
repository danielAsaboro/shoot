import type {
  ChallengeTierId,
  DeskStanding,
  DeskTeam,
  StandingsEntry,
} from "./types.ts";

// ── Desk Definitions (8 desks, 2 per specialist focus) ───────────────────────

export const deskDefinitions: DeskTeam[] = [
  {
    id: "crypto-apex-desk",
    name: "Apex Desk",
    motto: "Maximum conviction, maximum control.",
    tierId: "apex",
    specialistType: "crypto",
    members: [],
    captainWallet: "",
    supporters: 2100,
  },
  {
    id: "crypto-impulse-desk",
    name: "Impulse Desk",
    motto: "Speed kills — in a good way.",
    tierId: "elite",
    specialistType: "crypto",
    members: [],
    captainWallet: "",
    supporters: 1650,
  },
  {
    id: "forex-orbit-desk",
    name: "Orbit Desk",
    motto: "Session discipline, macro vision.",
    tierId: "veteran",
    specialistType: "forex",
    members: [],
    captainWallet: "",
    supporters: 1380,
  },
  {
    id: "forex-precision-desk",
    name: "Precision Desk",
    motto: "Clean entries, clean exits.",
    tierId: "ranger",
    specialistType: "forex",
    members: [],
    captainWallet: "",
    supporters: 1120,
  },
  {
    id: "metals-vault-desk",
    name: "Vault Desk",
    motto: "Patience compounds edge.",
    tierId: "elite",
    specialistType: "metals",
    members: [],
    captainWallet: "",
    supporters: 960,
  },
  {
    id: "energy-macro-desk",
    name: "Macro Desk",
    motto: "Read the calendar, trade the flow.",
    tierId: "veteran",
    specialistType: "energy",
    members: [],
    captainWallet: "",
    supporters: 820,
  },
  {
    id: "multi-alpha-desk",
    name: "Alpha Desk",
    motto: "Every market, one strategy.",
    tierId: "apex",
    specialistType: "multi_asset",
    members: [],
    captainWallet: "",
    supporters: 1850,
  },
  {
    id: "multi-rotation-desk",
    name: "Rotation Desk",
    motto: "Diversify returns, not risk.",
    tierId: "elite",
    specialistType: "multi_asset",
    members: [],
    captainWallet: "",
    supporters: 1450,
  },
];

// ── Tier → Desk mapping ──────────────────────────────────────────────────────

const TIER_DESK_MAP: Record<ChallengeTierId, string[]> = {
  sprint: ["forex-precision-desk"],
  scout: ["forex-precision-desk", "energy-macro-desk"],
  ranger: ["forex-precision-desk", "energy-macro-desk"],
  veteran: ["forex-orbit-desk", "energy-macro-desk", "metals-vault-desk"],
  elite: ["crypto-impulse-desk", "commodities-vault-desk", "multi-rotation-desk"],
  apex: ["crypto-apex-desk", "multi-alpha-desk"],
};

// ── Desk Assignment ──────────────────────────────────────────────────────────

function hashWallet(wallet: string): number {
  let hash = 5381;
  for (let i = 0; i < wallet.length; i++) {
    hash = ((hash << 5) + hash + wallet.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

export function assignTraderToDesk(
  wallet: string,
  tierId: ChallengeTierId
): DeskTeam | undefined {
  const candidates = TIER_DESK_MAP[tierId];
  if (!candidates || candidates.length === 0) return undefined;

  const idx = hashWallet(wallet) % candidates.length;
  const deskId = candidates[idx];
  return deskDefinitions.find((d) => d.id === deskId);
}

// ── Desk Standings Computation ───────────────────────────────────────────────

export function computeDeskStandings(
  standings: StandingsEntry[],
  _cohortId: string
): DeskStanding[] {
  // Group traders by desk
  const deskMembers = new Map<string, StandingsEntry[]>();

  for (const entry of standings) {
    // Determine desk from wallet hash + tier guess (use rank as proxy)
    const tierId: ChallengeTierId =
      entry.rank <= 5 ? "apex"
      : entry.rank <= 10 ? "elite"
      : entry.rank <= 15 ? "veteran"
      : entry.rank <= 20 ? "ranger"
      : "scout";

    const desk = assignTraderToDesk(entry.wallet, tierId);
    if (!desk) continue;

    const existing = deskMembers.get(desk.id) ?? [];
    existing.push(entry);
    deskMembers.set(desk.id, existing);
  }

  const results: DeskStanding[] = [];

  for (const desk of deskDefinitions) {
    const members = deskMembers.get(desk.id) ?? [];
    if (members.length === 0) continue;

    const averageScore =
      members.reduce((sum, m) => sum + m.tournamentScore, 0) / members.length;
    const averagePnl =
      members.reduce((sum, m) => sum + m.pnlPercent, 0) / members.length;
    const totalVolume = members.reduce((sum, m) => sum + m.volumeUsd, 0);

    // Desk score = weighted average + supporter bonus
    const supporterBonus = Math.log10(desk.supporters + 1) * 2;
    const deskScore = Number(
      (averageScore * 0.6 + averagePnl * 0.3 + supporterBonus).toFixed(2)
    );

    // Promotion/relegation by desk score
    const promotion: DeskStanding["promotion"] =
      deskScore > 120 ? "promoted" : deskScore < 60 ? "relegated" : "stable";

    const deskWithMembers: DeskTeam = {
      ...desk,
      members: members.map((m) => m.wallet),
      captainWallet: members[0]?.wallet ?? "",
    };

    results.push({
      desk: deskWithMembers,
      averageScore: Number(averageScore.toFixed(2)),
      averagePnl: Number(averagePnl.toFixed(2)),
      totalVolume,
      deskScore,
      promotion,
    });
  }

  // Sort by desk score descending
  results.sort((a, b) => b.deskScore - a.deskScore);
  return results;
}

// ── Desk vs Desk ─────────────────────────────────────────────────────────────

export function resolveDeskMatchup(
  deskA: DeskStanding,
  deskB: DeskStanding
): { winner: DeskTeam; margin: number } {
  const margin = Number(
    (deskA.deskScore - deskB.deskScore).toFixed(2)
  );

  return {
    winner: margin >= 0 ? deskA.desk : deskB.desk,
    margin: Math.abs(margin),
  };
}
