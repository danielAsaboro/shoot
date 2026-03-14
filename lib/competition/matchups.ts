import type {
  HeadToHeadMatch,
  LivePnlRace,
  LivePnlRaceEntry,
  MatchupResult,
  PnlMomentum,
  RiskEvent,
  StandingsEntry,
} from "./types.ts";

// ── Seeded PRNG ──────────────────────────────────────────────────────────────

function createMatchRng(seed: number) {
  let s = seed | 0;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

function hashMatchSeed(str: string): number {
  let hash = 7919;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

// ── Head-to-Head Matchup Generation ──────────────────────────────────────────

export function generateCohortMatchups(
  standings: StandingsEntry[],
  cohortId: string
): HeadToHeadMatch[] {
  const eligible = standings.filter((s) => s.eligible);

  if (eligible.length < 2) return [];

  // Pair by rank: #1 vs #2, #3 vs #4, etc. (deterministic, no RNG)
  const sorted = [...eligible].sort((a, b) => a.rank - b.rank);

  const matches: HeadToHeadMatch[] = [];
  const baseTime = Date.now();

  for (let i = 0; i + 1 < sorted.length; i += 2) {
    const a = sorted[i];
    const b = sorted[i + 1];

    const windowStart = new Date(baseTime - 3600000 * 2).toISOString();
    const windowEnd = new Date(baseTime + 3600000 * 4).toISOString();

    const result = resolveHeadToHead(a, b, []);

    matches.push({
      id: `h2h-${cohortId}-${i}`,
      cohortId,
      traderA: a.wallet,
      traderB: b.wallet,
      window: { start: windowStart, end: windowEnd },
      status: "completed",
      result,
    });
  }

  return matches;
}

// ── Head-to-Head Resolution ──────────────────────────────────────────────────

export function resolveHeadToHead(
  traderA: StandingsEntry,
  traderB: StandingsEntry,
  riskEvents: RiskEvent[]
): MatchupResult {
  // Apply risk event noise
  let scoreA = traderA.tournamentScore;
  let scoreB = traderB.tournamentScore;

  for (const event of riskEvents) {
    const impactA = event.modifier * (0.8 + Math.random() * 0.4);
    const impactB = event.modifier * (0.8 + Math.random() * 0.4);
    scoreA += impactA * 10;
    scoreB += impactB * 10;
  }

  const marginScore = Number((scoreA - scoreB).toFixed(2));
  const marginPnl = Number(
    (traderA.pnlPercent - traderB.pnlPercent).toFixed(2)
  );
  const isDraw = Math.abs(marginScore) < 0.5;

  return {
    winnerId: isDraw
      ? traderA.wallet
      : marginScore >= 0
        ? traderA.wallet
        : traderB.wallet,
    loserId: isDraw
      ? traderB.wallet
      : marginScore >= 0
        ? traderB.wallet
        : traderA.wallet,
    marginPnl: Math.abs(marginPnl),
    marginScore: Math.abs(marginScore),
    isDraw,
    riskEventActive: riskEvents.length > 0 ? riskEvents[0].id : undefined,
  };
}

// ── Live P&L Race ────────────────────────────────────────────────────────────

export function createLivePnlRace(
  standings: StandingsEntry[],
  cohortId: string
): LivePnlRace {
  const entries: LivePnlRaceEntry[] = standings.map((s) => {
    // Determine momentum from PnL direction
    const momentum: PnlMomentum =
      s.pnlPercent > 10 ? "surging" : s.pnlPercent > 0 ? "stable" : "fading";

    // rankDelta computed from previousRank if available
    const prevRank = (s as StandingsEntry & { previousRank?: number }).previousRank;
    const rankDelta = prevRank ? prevRank - s.rank : 0;

    return {
      wallet: s.wallet,
      displayName: s.displayName,
      pnl: s.pnlPercent,
      score: s.tournamentScore,
      momentum,
      rankDelta,
    };
  });

  // Sort by PnL descending
  entries.sort((a, b) => b.pnl - a.pnl);

  return {
    cohortId,
    timestamp: new Date().toISOString(),
    entries,
  };
}

// ── Matchup Odds ─────────────────────────────────────────────────────────────

export function computeMatchupOdds(
  traderA: StandingsEntry,
  traderB: StandingsEntry
): { aWinProb: number; bWinProb: number; drawProb: number } {
  const diff = traderA.tournamentScore - traderB.tournamentScore;
  const scale = 50; // normalizer

  // Logistic-style probability from score differential
  const aRaw = 1 / (1 + Math.exp(-diff / scale));
  const drawProb = Math.max(0.05, 0.15 - Math.abs(diff) / 200);

  const aWinProb = Number(((1 - drawProb) * aRaw).toFixed(3));
  const bWinProb = Number(((1 - drawProb) * (1 - aRaw)).toFixed(3));

  return {
    aWinProb,
    bWinProb,
    drawProb: Number(drawProb.toFixed(3)),
  };
}
