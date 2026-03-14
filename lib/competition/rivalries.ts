import type { HeadToHeadMatch, PropRivalry } from "./types.ts";

// ── Rivalry Detection ────────────────────────────────────────────────────────

export function detectRivalries(
  matchupHistory: HeadToHeadMatch[]
): PropRivalry[] {
  // Aggregate meetings between pairs
  const pairMap = new Map<string, {
    walletA: string;
    walletB: string;
    aWins: number;
    bWins: number;
    draws: number;
  }>();

  for (const match of matchupHistory) {
    if (!match.result) continue;

    const [a, b] = [match.traderA, match.traderB].sort();
    const key = `${a}::${b}`;

    const existing = pairMap.get(key) ?? {
      walletA: a,
      walletB: b,
      aWins: 0,
      bWins: 0,
      draws: 0,
    };

    if (match.result.isDraw) {
      existing.draws++;
    } else if (match.result.winnerId === a) {
      existing.aWins++;
    } else {
      existing.bWins++;
    }

    pairMap.set(key, existing);
  }

  // Convert to rivalries (need at least 2 meetings)
  const rivalries: PropRivalry[] = [];

  for (const pair of pairMap.values()) {
    const meetings = pair.aWins + pair.bWins + pair.draws;
    if (meetings < 2) continue;

    const intensity = Math.min(10, meetings * 2 + Math.abs(pair.aWins - pair.bWins));
    const tag = generateRivalryTag({
      walletA: pair.walletA,
      walletB: pair.walletB,
      meetings,
      aWins: pair.aWins,
      bWins: pair.bWins,
      draws: pair.draws,
      narrativeTag: "",
      intensity,
    });

    rivalries.push({
      walletA: pair.walletA,
      walletB: pair.walletB,
      meetings,
      aWins: pair.aWins,
      bWins: pair.bWins,
      draws: pair.draws,
      narrativeTag: tag,
      intensity,
    });
  }

  // Sort by intensity descending
  rivalries.sort((a, b) => b.intensity - a.intensity);
  return rivalries;
}

// ── Rivalry Tag Generation ───────────────────────────────────────────────────

export function generateRivalryTag(rivalry: PropRivalry): string {
  const { meetings, aWins, bWins, draws } = rivalry;

  if (meetings >= 5) return "Bitter Rivals";
  if (draws >= 2) return "Mirror Match";
  if (aWins === 0 || bWins === 0) return "David vs Goliath";
  if (meetings === 2) return "The Rematch";
  if (Math.abs(aWins - bWins) <= 1) return "Dead Even";
  if (meetings >= 4) return "Old Enemies";
  return "Emerging Rivalry";
}
