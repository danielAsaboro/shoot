import type { AdrenaPosition } from "../adrena/client.ts";

// ── Types ────────────────────────────────────────────────────────────────────

export type DailyMissionType =
  | "best_roi_today"
  | "most_trades_today"
  | "first_trade_today"
  | "highest_volume_today"
  | "best_win_rate_today";

export interface DailyMissionTemplate {
  type: DailyMissionType;
  name: string;
  description: string;
  evaluateFn: string;
}

export interface DailyMissionResult {
  wallet: string;
  value: number;
  rank: number;
}

// ── Mission catalog ──────────────────────────────────────────────────────────

export const DAILY_MISSION_CATALOG: DailyMissionTemplate[] = [
  {
    type: "best_roi_today",
    name: "Top ROI",
    description:
      "Achieve the highest return-on-investment across all closed positions today.",
    evaluateFn: "evaluateBestRoi",
  },
  {
    type: "most_trades_today",
    name: "Volume King",
    description: "Close more trades than anyone else before UTC midnight.",
    evaluateFn: "evaluateMostTrades",
  },
  {
    type: "first_trade_today",
    name: "Early Bird",
    description:
      "Be the first trader to close a position after the day resets at UTC midnight.",
    evaluateFn: "evaluateFirstTrade",
  },
  {
    type: "highest_volume_today",
    name: "Whale Watch",
    description:
      "Rack up the highest total notional volume (entry_size) across today's closed positions.",
    evaluateFn: "evaluateHighestVolume",
  },
  {
    type: "best_win_rate_today",
    name: "Sharpshooter",
    description:
      "Post the best win rate today with a minimum of 3 closed trades.",
    evaluateFn: "evaluateBestWinRate",
  },
];

// ── Deterministic daily selection ────────────────────────────────────────────

/**
 * Simple string-hash that produces a positive 32-bit integer.
 * Used to seed the deterministic daily selection.
 */
function hashDateString(dateStr: string): number {
  let hash = 0;
  for (let i = 0; i < dateStr.length; i++) {
    hash = (hash * 31 + dateStr.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

/**
 * Return exactly 3 missions for the given date.
 * The selection is deterministic: same date always yields the same 3 missions.
 */
export function selectDailyMissions(date: Date): DailyMissionTemplate[] {
  const dateStr = date.toISOString().slice(0, 10); // "YYYY-MM-DD"
  const seed = hashDateString(dateStr);

  // Fisher-Yates-style pick of 3 from 5, driven by the seed
  const indices = DAILY_MISSION_CATALOG.map((_, i) => i);
  let s = seed;
  for (let i = indices.length - 1; i > 0; i--) {
    s = (s * 1103515245 + 12345) >>> 0; // LCG step
    const j = s % (i + 1);
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }

  return indices.slice(0, 3).map((i) => DAILY_MISSION_CATALOG[i]);
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Filter to positions that closed within [windowStart, windowEnd).
 */
function closedInWindow(
  positions: AdrenaPosition[],
  windowStart: Date,
  windowEnd: Date
): AdrenaPosition[] {
  return positions.filter((p) => {
    if (p.status !== "close" && p.status !== "liquidate") return false;
    if (!p.exit_date) return false;
    const exit = new Date(p.exit_date);
    return exit >= windowStart && exit < windowEnd;
  });
}

function rankResults(
  entries: { wallet: string; value: number }[],
  descending = true
): DailyMissionResult[] {
  const sorted = [...entries].sort((a, b) =>
    descending ? b.value - a.value : a.value - b.value
  );
  return sorted.map((e, i) => ({
    wallet: e.wallet,
    value: e.value,
    rank: i + 1,
  }));
}

// ── Evaluation functions ─────────────────────────────────────────────────────

/**
 * Best ROI: sum(pnl) / sum(collateral_amount) per wallet.
 */
export function evaluateBestRoi(
  positions: Map<string, AdrenaPosition[]>,
  windowStart: Date,
  windowEnd: Date
): DailyMissionResult[] {
  const entries: { wallet: string; value: number }[] = [];

  for (const [wallet, allPos] of positions) {
    const closed = closedInWindow(allPos, windowStart, windowEnd);
    if (closed.length === 0) continue;

    const totalPnl = closed.reduce((s, p) => s + (p.pnl ?? 0), 0);
    const totalCollateral = closed.reduce((s, p) => s + p.collateral_amount, 0);
    if (totalCollateral === 0) continue;

    entries.push({ wallet, value: totalPnl / totalCollateral });
  }

  return rankResults(entries, true);
}

/**
 * Most trades: count of closed positions per wallet.
 */
export function evaluateMostTrades(
  positions: Map<string, AdrenaPosition[]>,
  windowStart: Date,
  windowEnd: Date
): DailyMissionResult[] {
  const entries: { wallet: string; value: number }[] = [];

  for (const [wallet, allPos] of positions) {
    const closed = closedInWindow(allPos, windowStart, windowEnd);
    if (closed.length === 0) continue;
    entries.push({ wallet, value: closed.length });
  }

  return rankResults(entries, true);
}

/**
 * Highest volume: sum(entry_size) for closed positions per wallet.
 */
export function evaluateHighestVolume(
  positions: Map<string, AdrenaPosition[]>,
  windowStart: Date,
  windowEnd: Date
): DailyMissionResult[] {
  const entries: { wallet: string; value: number }[] = [];

  for (const [wallet, allPos] of positions) {
    const closed = closedInWindow(allPos, windowStart, windowEnd);
    if (closed.length === 0) continue;

    const totalVolume = closed.reduce((s, p) => s + p.entry_size, 0);
    entries.push({ wallet, value: totalVolume });
  }

  return rankResults(entries, true);
}

/**
 * Best win rate: wins / total for closed positions, minimum 3 trades required.
 */
export function evaluateBestWinRate(
  positions: Map<string, AdrenaPosition[]>,
  windowStart: Date,
  windowEnd: Date
): DailyMissionResult[] {
  const entries: { wallet: string; value: number }[] = [];

  for (const [wallet, allPos] of positions) {
    const closed = closedInWindow(allPos, windowStart, windowEnd);
    if (closed.length < 3) continue;

    const wins = closed.filter((p) => (p.pnl ?? 0) > 0).length;
    entries.push({ wallet, value: wins / closed.length });
  }

  return rankResults(entries, true);
}
