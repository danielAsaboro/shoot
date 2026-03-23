import type {
  CompetitionCohortView,
  DeskStanding,
  HeadToHeadMatch,
  PropGoldenTrade,
  PropNarrativeBeat,
  PropNarrativeSeverity,
  RiskEvent,
  StandingsEntry,
} from "./types.ts";

// ── Narrative Beat Generation ────────────────────────────────────────────────

export function generatePropNarrativeBeats(
  cohort: CompetitionCohortView,
  matchups: HeadToHeadMatch[],
  riskEvents: RiskEvent[],
  goldenTrade?: PropGoldenTrade,
  deskStandings?: DeskStanding[],
  crowdFavorites?: Map<string, number>
): PropNarrativeBeat[] {
  const beats: PropNarrativeBeat[] = [];
  const now = Date.now();
  const cohortId = cohort.id;
  const standings = cohort.standings;

  // ── Rank surge: trader climbed 3+ ranks (uses previousRank if available) ──
  for (const entry of standings) {
    const rankDelta = (entry as StandingsEntry & { previousRank?: number })
      .previousRank
      ? (entry as StandingsEntry & { previousRank?: number }).previousRank! -
        entry.rank
      : 0;

    if (rankDelta >= 3) {
      beats.push({
        type: "rank-surge",
        headline: `RANK SURGE: ${entry.displayName} climbs ${rankDelta} positions into #${entry.rank}`,
        subtext: `+${entry.pnlPercent.toFixed(1)}% PnL and ${entry.consistencyScore} consistency driving the move.`,
        timestamp: now - Math.floor(Math.random() * 3600000),
        severity: entry.rank <= 3 ? "legendary" : "hype",
        cohortId,
      });
    }
  }

  // ── Drawdown recovery: low drawdown with high PnL ──
  for (const entry of standings) {
    if (entry.maxDrawdownPercent < 3 && entry.pnlPercent > 15) {
      beats.push({
        type: "drawdown-recovery",
        headline: `IRON HANDS: ${entry.displayName} hits +${entry.pnlPercent.toFixed(1)}% with only ${entry.maxDrawdownPercent.toFixed(1)}% max drawdown`,
        subtext:
          "Clean risk profile with strong returns. Textbook challenge execution.",
        timestamp: now - Math.floor(Math.random() * 1800000),
        severity: "hype",
        cohortId,
      });
    }
  }

  // ── Risk event survivor ──
  if (riskEvents.length > 0) {
    const top3 = standings.slice(0, 3);
    for (const entry of top3) {
      beats.push({
        type: "risk-event-survivor",
        headline: `SURVIVOR: ${entry.displayName} holds #${entry.rank} through ${riskEvents[0].label}`,
        subtext: `${riskEvents[0].description} — and they adapted.`,
        timestamp: now - Math.floor(Math.random() * 900000),
        severity: riskEvents[0].severity === "severe" ? "legendary" : "hype",
        cohortId,
      });
    }
  }

  // ── Funded promotion ──
  for (const entry of standings) {
    if (entry.rank <= 2 && entry.eligible) {
      beats.push({
        type: "funded-promotion",
        headline: `FUNDED: ${entry.displayName} locks in funded trader status at #${entry.rank}`,
        subtext:
          "Revenue share and capital allocation unlocked for the season.",
        timestamp: now - Math.floor(Math.random() * 600000),
        severity: "hype",
        cohortId,
      });
    }
  }

  // ── Upset: low-ranked trader beats top-ranked in matchup ──
  for (const match of matchups) {
    if (!match.result || match.result.isDraw) continue;

    const winnerEntry = standings.find(
      (s) => s.wallet === match.result!.winnerId
    );
    const loserEntry = standings.find(
      (s) => s.wallet === match.result!.loserId
    );

    if (winnerEntry && loserEntry && winnerEntry.rank > loserEntry.rank + 5) {
      beats.push({
        type: "upset",
        headline: `UPSET: ${winnerEntry.displayName} (#${winnerEntry.rank}) defeats ${loserEntry.displayName} (#${loserEntry.rank}) head-to-head`,
        subtext: `Score margin: ${match.result!.marginScore.toFixed(1)} — nobody saw this coming.`,
        timestamp: now - Math.floor(Math.random() * 900000),
        severity: "legendary",
        cohortId,
      });
    }
  }

  // ── Perfect record: top rank, all eligible, zero flags ──
  const topEntry = standings[0];
  if (topEntry && topEntry.eligible && topEntry.pnlPercent > 18) {
    beats.push({
      type: "perfect-record",
      headline: `DOMINANT: ${topEntry.displayName} leads with +${topEntry.pnlPercent.toFixed(1)}% — untouchable so far`,
      subtext: `Score: ${topEntry.tournamentScore} | Consistency: ${topEntry.consistencyScore}`,
      timestamp: now - Math.floor(Math.random() * 600000),
      severity: "hype",
      cohortId,
    });
  }

  // ── Streak milestone (uses streakDays from standings if available) ──
  for (const entry of standings) {
    const streakDays =
      (entry as StandingsEntry & { streakDays?: number }).streakDays ?? 0;
    if (streakDays >= 10) {
      beats.push({
        type: "streak-milestone",
        headline: `UNBREAKABLE: ${entry.displayName} hits a ${streakDays}-day trading streak`,
        subtext: "5x mutagen multiplier activated. Consistency pays.",
        timestamp: now - Math.floor(Math.random() * 1200000),
        severity: "hype",
        cohortId,
      });
      break; // Only one per cohort
    }
  }

  // ── Golden trade ──
  if (goldenTrade) {
    beats.push({
      type: "golden-trade",
      headline: `GOLDEN TRADE: ${goldenTrade.displayName} hits $${goldenTrade.pnlUsd.toLocaleString()} on a ${goldenTrade.leverage}x ${goldenTrade.direction} ${goldenTrade.market}`,
      subtext: `+${goldenTrade.pnlPercent.toFixed(1)}% return. The cohort's single best trade.`,
      timestamp: now,
      severity: "legendary",
      cohortId,
    });
  }

  // ── Desk rivalry: two desks of the same specialist type within 10% score ──
  if (deskStandings && deskStandings.length >= 2) {
    const bySpecialist = new Map<string, DeskStanding[]>();
    for (const ds of deskStandings) {
      if (!ds.desk.specialistType) continue;
      const list = bySpecialist.get(ds.desk.specialistType) ?? [];
      list.push(ds);
      bySpecialist.set(ds.desk.specialistType, list);
    }
    for (const [, desks] of bySpecialist) {
      if (desks.length < 2) continue;
      desks.sort((a, b) => b.deskScore - a.deskScore);
      const top = desks[0];
      const runner = desks[1];
      const gap = Math.abs(top.deskScore - runner.deskScore);
      const threshold = Math.max(top.deskScore, runner.deskScore) * 0.1;
      if (gap <= threshold) {
        beats.push({
          type: "desk-rivalry",
          headline: `DESK RIVALRY: ${top.desk.name} vs ${runner.desk.name} — separated by just ${gap.toFixed(1)} points`,
          subtext: `${top.desk.motto} meets ${runner.desk.motto}. The ${top.desk.specialistType} throne is up for grabs.`,
          timestamp: now - Math.floor(Math.random() * 600000),
          severity: "hype",
          cohortId,
        });
      }
    }
  }

  // ── Crowd favorite: trader with 5+ spectator votes ──
  if (crowdFavorites) {
    for (const [wallet, voteCount] of crowdFavorites) {
      if (voteCount >= 5) {
        const entry = standings.find((s) => s.wallet === wallet);
        if (entry) {
          beats.push({
            type: "crowd-favorite",
            headline: `CROWD FAVORITE: ${entry.displayName} backed by ${voteCount} spectator votes`,
            subtext: `The audience has spoken — ranked #${entry.rank} with ${entry.pnlPercent.toFixed(1)}% PnL.`,
            timestamp: now - Math.floor(Math.random() * 600000),
            severity: voteCount >= 10 ? "legendary" : "hype",
            cohortId,
          });
          break; // Only one crowd favorite beat per cohort
        }
      }
    }
  }

  // Sort by severity then timestamp
  const severityOrder: Record<PropNarrativeSeverity, number> = {
    legendary: 0,
    hype: 1,
    normal: 2,
  };

  return beats.sort((a, b) => {
    const severityDiff = severityOrder[a.severity] - severityOrder[b.severity];
    if (severityDiff !== 0) return severityDiff;
    return b.timestamp - a.timestamp;
  });
}

// ── Golden Trade Finder ──────────────────────────────────────────────────────

export function findCohortGoldenTrade(
  cohortId: string,
  standings: StandingsEntry[]
): PropGoldenTrade | null {
  if (standings.length === 0) return null;

  // The golden trade goes to the trader with highest PnL %
  const best = standings.reduce((acc, entry) =>
    entry.pnlPercent > acc.pnlPercent ? entry : acc
  );

  if (best.pnlPercent <= 0) return null;

  return {
    traderId: best.wallet,
    displayName: best.displayName,
    market: best.badge ?? "PERP",
    direction: best.pnlPercent > 0 ? "long" : "short",
    pnlUsd: Math.round((best.volumeUsd * best.pnlPercent) / 100),
    pnlPercent: best.pnlPercent,
    leverage: 1,
    cohortContext: `${cohortId} — ranked #${best.rank}`,
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function simpleHash(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}
