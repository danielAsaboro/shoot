import type {
  AssetClassId,
  Group,
  GroupId,
  GroupStanding,
  LeaderboardEntry,
} from "./types.ts";

// ── Seeded PRNG ────────────────────────────────────────────────────────────────

function createSeededRng(seed: number) {
  let s = seed | 0;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

function hashSeed(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

// ── Seeded shuffle ─────────────────────────────────────────────────────────────

function seededShuffle<T>(arr: T[], rng: () => number): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// ── Group labels ───────────────────────────────────────────────────────────────

const GROUP_LABELS = ["A", "B", "C", "D", "E", "F", "G", "H"];

// ── Draw groups ────────────────────────────────────────────────────────────────

export function drawGroups(
  qualifiers: LeaderboardEntry[],
  division: AssetClassId,
  seededWallets?: string[]
): Group[] {
  let sorted: LeaderboardEntry[];

  if (seededWallets && seededWallets.length > 0) {
    // Place seeded wallets first (in seed order), then fill remaining by rank
    const seededSet = new Set(seededWallets);
    const seeded = seededWallets
      .map((w) => qualifiers.find((q) => q.trader.id === w))
      .filter((q): q is LeaderboardEntry => q !== undefined);
    const unseeded = qualifiers
      .filter((q) => !seededSet.has(q.trader.id))
      .sort((a, b) => a.rank - b.rank);
    sorted = [...seeded, ...unseeded].slice(0, 32);
  } else {
    sorted = [...qualifiers].sort((a, b) => a.rank - b.rank).slice(0, 32);
  }

  if (sorted.length < 32) {
    throw new Error(
      `Need 32 qualifiers for group draw, got ${sorted.length} in ${division}`
    );
  }

  const rng = createSeededRng(hashSeed(`${division}-group-draw`));

  // Split into 4 pots of 8
  const pots = [
    sorted.slice(0, 8),   // Pot 1: seeds 1-8
    sorted.slice(8, 16),  // Pot 2: seeds 9-16
    sorted.slice(16, 24), // Pot 3: seeds 17-24
    sorted.slice(24, 32), // Pot 4: seeds 25-32
  ];

  // Shuffle each pot
  const shuffledPots = pots.map((pot) => seededShuffle(pot, rng));

  // Draw one from each pot into each group
  const groups: Group[] = GROUP_LABELS.map((label, groupIndex) => {
    const traders = shuffledPots.map((pot) => pot[groupIndex]);
    const groupId: GroupId = `${division}-${label}`;
    const seedStrength =
      traders.reduce((sum, t) => sum + t.rank, 0) / traders.length;

    return {
      id: groupId,
      label: `Group ${label}`,
      division,
      traders,
      matches: [],
      standings: [],
      isGroupOfDeath: false,
      seedStrength,
    };
  });

  // Group of Death guarantee: if no group has avg seed in top quartile
  // of difficulty (lowest avg rank = strongest), force one
  ensureGroupOfDeath(groups);

  return groups;
}

function ensureGroupOfDeath(groups: Group[]): void {
  // Sort groups by seed strength (lower = stronger group)
  const sorted = [...groups].sort((a, b) => a.seedStrength - b.seedStrength);
  const avgStrength =
    groups.reduce((sum, g) => sum + g.seedStrength, 0) / groups.length;

  // A group is "Group of Death" if its avg seed is significantly below average
  // (meaning it has stronger seeds than expected)
  const threshold = avgStrength * 0.85;

  const naturalGroupOfDeath = sorted.find(
    (g) => g.seedStrength <= threshold
  );

  if (naturalGroupOfDeath) {
    naturalGroupOfDeath.isGroupOfDeath = true;
    return;
  }

  // No natural Group of Death — mark the strongest group and swap in a
  // higher-seeded Pot 2 trader to make it tougher
  const strongest = sorted[0];
  strongest.isGroupOfDeath = true;

  // Find the best Pot 2 trader not in this group
  const pot2InGroup = strongest.traders.find(
    (t) => t.rank >= 9 && t.rank <= 16
  );
  const weakest = sorted[sorted.length - 1];
  const pot2InWeakest = weakest.traders.find(
    (t) => t.rank >= 9 && t.rank <= 16
  );

  if (pot2InGroup && pot2InWeakest) {
    // Swap Pot 2 traders between strongest and weakest groups
    const strongIdx = strongest.traders.indexOf(pot2InGroup);
    const weakIdx = weakest.traders.indexOf(pot2InWeakest);
    strongest.traders[strongIdx] = pot2InWeakest;
    weakest.traders[weakIdx] = pot2InGroup;

    // Recalculate seed strengths
    strongest.seedStrength =
      strongest.traders.reduce((sum, t) => sum + t.rank, 0) /
      strongest.traders.length;
    weakest.seedStrength =
      weakest.traders.reduce((sum, t) => sum + t.rank, 0) /
      weakest.traders.length;
  }
}

// ── Generate round-robin schedule ──────────────────────────────────────────────

export function generateRoundRobinSchedule(
  group: Group
): { traderA: LeaderboardEntry; traderB: LeaderboardEntry; matchday: number }[] {
  const t = group.traders;
  if (t.length !== 4) {
    throw new Error(`Group ${group.id} must have exactly 4 traders`);
  }

  // 3 matchdays, 2 matches each (standard round-robin for 4 teams)
  return [
    // Matchday 1
    { traderA: t[0], traderB: t[3], matchday: 1 },
    { traderA: t[1], traderB: t[2], matchday: 1 },
    // Matchday 2
    { traderA: t[0], traderB: t[2], matchday: 2 },
    { traderA: t[3], traderB: t[1], matchday: 2 },
    // Matchday 3
    { traderA: t[0], traderB: t[1], matchday: 3 },
    { traderA: t[2], traderB: t[3], matchday: 3 },
  ];
}

// ── Compute group standings ────────────────────────────────────────────────────

export function computeGroupStandings(group: Group): GroupStanding[] {
  const standingMap = new Map<string, GroupStanding>();

  // Initialize standings for each trader
  for (const entry of group.traders) {
    standingMap.set(entry.trader.id, {
      trader: entry.trader,
      entry,
      played: 0,
      won: 0,
      drawn: 0,
      lost: 0,
      points: 0,
      raroiFor: 0,
      raroiAgainst: 0,
      raroiDifference: 0,
      totalVolume: entry.metrics.weeklyVolume,
      headToHeadRecord: {},
      qualified: false,
      groupWinner: false,
    });
  }

  // Process matches
  for (const match of group.matches) {
    const standingA = standingMap.get(match.traderA.id)!;
    const standingB = standingMap.get(match.traderB.id)!;

    standingA.played++;
    standingB.played++;
    standingA.raroiFor += match.raroiA;
    standingA.raroiAgainst += match.raroiB;
    standingB.raroiFor += match.raroiB;
    standingB.raroiAgainst += match.raroiA;

    if (match.result === "win") {
      standingA.won++;
      standingA.points += 3;
      standingB.lost++;
      standingA.headToHeadRecord[match.traderB.id] = "win";
      standingB.headToHeadRecord[match.traderA.id] = "loss";
    } else if (match.result === "loss") {
      standingB.won++;
      standingB.points += 3;
      standingA.lost++;
      standingA.headToHeadRecord[match.traderB.id] = "loss";
      standingB.headToHeadRecord[match.traderA.id] = "win";
    } else {
      standingA.drawn++;
      standingB.drawn++;
      standingA.points += 1;
      standingB.points += 1;
      standingA.headToHeadRecord[match.traderB.id] = "draw";
      standingB.headToHeadRecord[match.traderA.id] = "draw";
    }
  }

  // Compute RAROI difference
  for (const standing of standingMap.values()) {
    standing.raroiDifference = Number(
      (standing.raroiFor - standing.raroiAgainst).toFixed(2)
    );
  }

  // Sort by: points → RAROI difference → head-to-head → total volume
  const sorted = [...standingMap.values()].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.raroiDifference !== a.raroiDifference)
      return b.raroiDifference - a.raroiDifference;

    // Head-to-head
    const h2h = a.headToHeadRecord[b.trader.id];
    if (h2h === "win") return -1;
    if (h2h === "loss") return 1;

    return b.totalVolume - a.totalVolume;
  });

  // Mark top 2 as qualified, #1 as group winner
  sorted.forEach((standing, index) => {
    standing.qualified = index < 2;
    standing.groupWinner = index === 0;
  });

  return sorted;
}
