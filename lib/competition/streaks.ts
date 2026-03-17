/**
 * Streak state machine — DB-backed.
 *
 * Tracks daily trading activity using UTC day boundaries.
 * Multiplier bands: 2-day=1.5×, 3-4=2×, 5-9=3×, 10+=5× + "Unbreakable" badge.
 * All state persisted to PostgreSQL.
 */

import type { StreakState } from "../shared/types.ts";

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Get the current UTC date string "YYYY-MM-DD". */
function utcDateString(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

/** Get the UTC date string for yesterday. */
function yesterdayUtc(date: Date = new Date()): string {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() - 1);
  return utcDateString(d);
}

// ── Multiplier bands ─────────────────────────────────────────────────────────

export interface MultiplierBand {
  min: number;
  max: number;
  multiplier: number;
  label: string;
}

export const MULTIPLIER_BANDS: MultiplierBand[] = [
  { min: 2, max: 2, multiplier: 1.5, label: "2-streak" },
  { min: 3, max: 4, multiplier: 2, label: "3-4 streak" },
  { min: 5, max: 9, multiplier: 3, label: "5-9 streak + bonus raffle ticket" },
  { min: 10, max: Infinity, multiplier: 5, label: "10+ streak" },
];

export function getMultiplier(streakDays: number): number {
  const band = MULTIPLIER_BANDS.find((b) => streakDays >= b.min && streakDays <= b.max);
  return band?.multiplier ?? 1;
}

/** Returns bonus raffle tickets for the given streak length (1 for 5-9 days, 0 otherwise). */
export function getBonusRaffleTickets(streakDays: number): number {
  return streakDays >= 5 && streakDays <= 9 ? 1 : 0;
}

// ── Streak tracker (DB-backed) ──────────────────────────────────────────────

export class StreakTracker {
  private streakDays = 0;
  private lastActivityDate = "";
  private wallet: string | null;

  constructor(wallet?: string) {
    this.wallet = wallet ?? null;
  }

  /** Load streak state from server API. */
  async loadFromDb(): Promise<void> {
    if (!this.wallet) return;
    try {
      const res = await fetch(`/api/competition/streak?wallet=${encodeURIComponent(this.wallet)}`);
      if (!res.ok) return;
      const data = await res.json();
      if (data.streak) {
        this.streakDays = data.streak.streakDays ?? 0;
        this.lastActivityDate = data.streak.lastActivityDate ?? "";
      }
    } catch {
      // API unavailable
    }
  }

  /** Persist streak state via server API. */
  private async persistToDb(): Promise<void> {
    if (!this.wallet) return;
    try {
      await fetch("/api/competition/streak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wallet: this.wallet,
          streakDays: this.streakDays,
          lastActivityDate: this.lastActivityDate,
        }),
      });
    } catch {
      // API unavailable
    }
  }

  /**
   * Record trading activity for the current UTC day.
   * Returns the updated streak days count.
   */
  async recordActivity(now: Date = new Date()): Promise<number> {
    const today = utcDateString(now);
    const yesterday = yesterdayUtc(now);

    if (this.lastActivityDate === today) {
      // Already recorded today — no change
      return this.streakDays;
    }

    if (this.lastActivityDate === yesterday) {
      // Consecutive day — extend streak
      this.streakDays += 1;
    } else if (this.lastActivityDate === "") {
      // First activity ever
      this.streakDays = 1;
    } else {
      // Gap of 2+ days — reset streak
      this.streakDays = 1;
    }

    this.lastActivityDate = today;
    await this.persistToDb();
    return this.streakDays;
  }

  /** Get the current streak days without modifying state. */
  getStreak(): number {
    return this.streakDays;
  }

  /** Get the current multiplier based on streak length. */
  getMultiplier(): number {
    return getMultiplier(this.streakDays);
  }

  /**
   * Check if the streak is at risk (last activity was yesterday or earlier).
   * Returns the current StreakState.
   */
  checkWarning(now: Date = new Date()): StreakState {
    if (this.streakDays === 0 || this.lastActivityDate === "") {
      return "broken";
    }

    const today = utcDateString(now);
    const yesterday = yesterdayUtc(now);

    if (this.lastActivityDate === today) {
      return "alive";
    }
    if (this.lastActivityDate === yesterday) {
      return "warning";
    }
    return "broken";
  }

  /** Check if the "Unbreakable" badge should be awarded (10+ day streak). */
  isUnbreakable(): boolean {
    return this.streakDays >= 10;
  }

  /** Reset streak state. */
  reset() {
    this.streakDays = 0;
    this.lastActivityDate = "";
  }
}
