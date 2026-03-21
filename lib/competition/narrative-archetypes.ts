/**
 * Trader archetype classification and rich narrative generation.
 *
 * Archetypes are assigned based on a trader's performance metrics and
 * produce narrative headlines/subtexts for spectator commentary.
 */

import type {
  HeadToHeadMatch,
  PropNarrativeBeat,
  StandingsEntry,
} from "./types.ts";

// ── Archetype Definitions ────────────────────────────────────────────────────

export type TraderArchetype =
  | "sniper"
  | "grinder"
  | "degen"
  | "iron-hands"
  | "comeback-kid";

export interface ArchetypeProfile {
  archetype: TraderArchetype;
  headline: string;
  narrative: string;
}

export function classifyArchetype(entry: StandingsEntry): ArchetypeProfile {
  const { winRate, volumeUsd, consistencyScore, maxDrawdownPercent, pnlPercent } = entry;
  const tradeCount = entry.tradeCount ?? 0;

  // Iron Hands: Tight risk management with strong positive returns
  if (maxDrawdownPercent < 3 && pnlPercent > 10) {
    return {
      archetype: "iron-hands",
      headline: `IRON HANDS: ${entry.displayName} holds steady at +${pnlPercent.toFixed(1)}% with ${maxDrawdownPercent.toFixed(1)}% max DD`,
      narrative: `${entry.displayName} is the textbook risk manager. Sub-3% drawdown with double-digit returns — the kind of profile funded desks look for. Every trade is measured, every exit planned.`,
    };
  }

  // Sniper: Very high win rate with few, precise trades
  if (winRate > 70 && tradeCount < 10 && tradeCount > 0) {
    return {
      archetype: "sniper",
      headline: `SNIPER: ${entry.displayName} hits ${winRate.toFixed(0)}% win rate on just ${tradeCount} trades`,
      narrative: `${entry.displayName} doesn't spray. ${tradeCount} trades, ${winRate.toFixed(0)}% hit rate. Each entry is a conviction play. When the sniper pulls the trigger, it counts.`,
    };
  }

  // Grinder: High volume and consistency, steady accumulation
  if (volumeUsd > 200000 && consistencyScore > 80) {
    return {
      archetype: "grinder",
      headline: `GRINDER: ${entry.displayName} grinds $${(volumeUsd / 1000).toFixed(0)}K volume with ${consistencyScore} consistency`,
      narrative: `${entry.displayName} is the volume machine. Over $${(volumeUsd / 1000).toFixed(0)}K traded with a consistency score of ${consistencyScore}. No flash, just relentless execution. The compound edge.`,
    };
  }

  // Degen: Big swings, big drawdowns, big PnL (positive or negative)
  if (maxDrawdownPercent > 8 && Math.abs(pnlPercent) > 15) {
    const direction = pnlPercent > 0 ? "up" : "down";
    return {
      archetype: "degen",
      headline: `DEGEN: ${entry.displayName} swings ${direction} ${Math.abs(pnlPercent).toFixed(1)}% with ${maxDrawdownPercent.toFixed(1)}% max drawdown`,
      narrative: `${entry.displayName} plays with fire. ${maxDrawdownPercent.toFixed(1)}% drawdown tells you the risk appetite. ${pnlPercent > 0 ? "But the returns are there — high risk, high reward on full display." : "The drawdown caught up this time. Redemption arc incoming?"}`,
    };
  }

  // Comeback Kid: Was negative, now positive and ranking well
  if (pnlPercent > 5 && entry.rank <= 10) {
    return {
      archetype: "comeback-kid",
      headline: `COMEBACK: ${entry.displayName} recovers to +${pnlPercent.toFixed(1)}% and climbs to #${entry.rank}`,
      narrative: `${entry.displayName} was down and fought back. Now at #${entry.rank} with +${pnlPercent.toFixed(1)}%. The leaderboard respects resilience.`,
    };
  }

  // Default: no strong archetype signal
  return {
    archetype: "grinder",
    headline: `${entry.displayName} holds #${entry.rank} with +${pnlPercent.toFixed(1)}%`,
    narrative: `${entry.displayName} is in the mix at rank #${entry.rank}. Steady performance across all metrics.`,
  };
}

// ── Match Summary Generation ─────────────────────────────────────────────────

export function generateMatchSummary(
  match: HeadToHeadMatch,
  standings: StandingsEntry[],
  cohortId: string
): PropNarrativeBeat | null {
  if (!match.result || match.result.isDraw) return null;

  const winner = standings.find((s) => s.wallet === match.result!.winnerId);
  const loser = standings.find((s) => s.wallet === match.result!.loserId);
  if (!winner || !loser) return null;

  const winnerArchetype = classifyArchetype(winner);
  const loserArchetype = classifyArchetype(loser);
  const margin = match.result.marginScore;
  const isUpset = winner.rank > loser.rank + 3;

  const closeness =
    margin < 2 ? "razor-thin" : margin < 5 ? "comfortable" : "dominant";

  const headline = isUpset
    ? `UPSET: ${winner.displayName} (${winnerArchetype.archetype}) defeats ${loser.displayName} (#${loser.rank}) by a ${closeness} margin`
    : `${winner.displayName} takes the H2H against ${loser.displayName} — ${closeness} ${margin.toFixed(1)}-point edge`;

  const subtext = `The ${winnerArchetype.archetype} vs the ${loserArchetype.archetype}. ${winner.displayName}'s +${winner.pnlPercent.toFixed(1)}% PnL sealed it against ${loser.displayName}'s ${loser.pnlPercent.toFixed(1)}%.`;

  return {
    type: "match-summary",
    headline,
    subtext,
    timestamp: Date.now(),
    severity: isUpset ? "legendary" : "hype",
    cohortId,
  };
}

// ── Storyline Beats (Multi-Poll Continuity) ──────────────────────────────────

export function generateStorylineBeats(
  cohortId: string,
  currentStandings: StandingsEntry[],
  previousStandings: StandingsEntry[]
): PropNarrativeBeat[] {
  const beats: PropNarrativeBeat[] = [];
  const now = Date.now();

  if (currentStandings.length === 0 || previousStandings.length === 0) return beats;

  const currentLeader = currentStandings[0];
  const previousLeader = previousStandings[0];

  // ── Consecutive #1: Same leader across polls ──
  if (currentLeader && previousLeader && currentLeader.wallet === previousLeader.wallet) {
    beats.push({
      type: "storyline",
      headline: `DOMINANT: ${currentLeader.displayName} holds the top spot with ${currentLeader.tournamentScore.toFixed(1)} points`,
      subtext: `Still unchallenged at #1. ${currentLeader.pnlPercent.toFixed(1)}% PnL, ${currentLeader.consistencyScore} consistency. Who's going to make a move?`,
      timestamp: now,
      severity: "hype",
      cohortId,
    });
  }

  // ── Closing gap: Trader within 5% of the leader's score ──
  if (currentStandings.length >= 2 && currentLeader) {
    const leaderScore = currentLeader.tournamentScore;
    for (const entry of currentStandings.slice(1, 5)) {
      const gap = leaderScore - entry.tournamentScore;
      const gapPercent = leaderScore > 0 ? (gap / leaderScore) * 100 : 0;

      if (gapPercent > 0 && gapPercent <= 5) {
        beats.push({
          type: "closing-gap",
          headline: `CLOSING IN: ${entry.displayName} is just ${gap.toFixed(1)} points behind ${currentLeader.displayName}`,
          subtext: `${gapPercent.toFixed(1)}% gap between #${entry.rank} and #1. One strong trade could flip the board.`,
          timestamp: now - Math.floor(Math.random() * 300000),
          severity: "hype",
          cohortId,
        });
        break; // Only report the closest challenger
      }
    }
  }

  // ── Comeback arc: Trader climbed from bottom half to top 5 ──
  for (const entry of currentStandings.slice(0, 5)) {
    const prev = previousStandings.find((s) => s.wallet === entry.wallet);
    if (prev && prev.rank > previousStandings.length / 2 && entry.rank <= 5) {
      beats.push({
        type: "storyline",
        headline: `COMEBACK ARC: ${entry.displayName} surges from #${prev.rank} to #${entry.rank}`,
        subtext: `From the bottom half to the top 5. ${(entry.pnlPercent - (prev.pnlPercent ?? 0)).toFixed(1)}% PnL swing driving the climb.`,
        timestamp: now - Math.floor(Math.random() * 600000),
        severity: "legendary",
        cohortId,
      });
    }
  }

  // ── Archetype reveal: Generate archetype for top 3 ──
  for (const entry of currentStandings.slice(0, 3)) {
    const profile = classifyArchetype(entry);
    // Only emit archetype reveals for distinctive archetypes
    if (profile.archetype !== "grinder" || entry.rank === 1) {
      beats.push({
        type: "archetype-reveal",
        headline: profile.headline,
        subtext: profile.narrative,
        timestamp: now - Math.floor(Math.random() * 900000),
        severity: entry.rank === 1 ? "legendary" : "normal",
        cohortId,
      });
    }
  }

  return beats;
}
