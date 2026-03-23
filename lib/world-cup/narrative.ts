import type {
  GroupStageBracket,
  GoldenTrade,
  NarrativeBeat,
  NarrativeSeverity,
} from "./types.ts";

// ── Narrative beat generation ──────────────────────────────────────────────────

export function generateNarrativeBeats(
  bracket: GroupStageBracket,
  goldenTrade?: GoldenTrade
): NarrativeBeat[] {
  const beats: NarrativeBeat[] = [];
  const now = Date.now();

  // Group stage narratives
  for (const group of bracket.groups) {
    // Perfect group records (9 pts = 3 wins)
    const perfectRecord = group.standings.find(
      (s) => s.points === 9 && s.played === 3
    );
    if (perfectRecord) {
      beats.push({
        type: "perfect-sweep",
        headline: `PERFECT SWEEP: ${perfectRecord.trader.alias} dominates ${group.label} with 9 points and +${perfectRecord.raroiDifference.toFixed(1)} RAROI`,
        subtext: `Three wins from three in the ${group.division} division.`,
        timestamp: now - Math.floor(Math.random() * 3600000),
        severity: "hype",
      });
    }

    // Group of Death survivor stories
    if (group.isGroupOfDeath) {
      const survivors = group.standings.filter((s) => s.qualified);
      for (const survivor of survivors) {
        beats.push({
          type: "group-of-death-survivor",
          headline: `GROUP OF DEATH SURVIVOR: ${survivor.trader.alias} emerges from ${group.label}`,
          subtext: `Avg seed ${group.seedStrength.toFixed(1)} — the toughest draw in ${group.division}.`,
          timestamp: now - Math.floor(Math.random() * 1800000),
          severity: "hype",
        });
      }
    }
  }

  // Knockout narratives
  const allKnockoutMatches = [
    ...bracket.roundOf16,
    ...bracket.quarterFinals,
    ...bracket.semiFinals,
    bracket.final,
    ...(bracket.thirdPlace ? [bracket.thirdPlace] : []),
  ];

  for (const match of allKnockoutMatches) {
    if (!match.winner || !match.left || !match.right) continue;

    // Upsets: lower seed beats higher by significant margin
    const leftSeed = match.left.rank;
    const rightSeed = match.right.rank;
    const winnerSeed =
      match.winner.trader.id === match.left.trader.id ? leftSeed : rightSeed;
    const loserSeed =
      match.winner.trader.id === match.left.trader.id ? rightSeed : leftSeed;
    const loser =
      match.winner.trader.id === match.left.trader.id
        ? match.right
        : match.left;

    if (winnerSeed > loserSeed + 8 && match.margin > 3) {
      beats.push({
        type: "upset",
        headline: `UPSET ALERT: ${match.winner.trader.alias} (Seed ${winnerSeed}) topples ${loser.trader.alias} (Seed ${loserSeed}) in the ${formatRound(match.round)}!`,
        subtext: `A +${match.margin.toFixed(1)} margin that nobody saw coming.`,
        timestamp: now - Math.floor(Math.random() * 900000),
        severity: "legendary",
      });
    }

    // Market twist impact
    if (match.twistMarket) {
      beats.push({
        type: "market-twist",
        headline: `TWIST: The ${match.twistMarket} round claims its impact — ${loser.trader.alias} eliminated after forced market`,
        subtext: `${match.winner.trader.alias} adapted better to the twist conditions.`,
        timestamp: now - Math.floor(Math.random() * 600000),
        severity: "hype",
      });
    }
  }

  // Golden trade update
  if (goldenTrade) {
    beats.push({
      type: "golden-trade",
      headline: `GOLDEN BOOT: ${goldenTrade.alias} hits $${goldenTrade.pnlUsd.toLocaleString()} on a ${goldenTrade.leverage}x ${goldenTrade.direction} ${goldenTrade.market}`,
      subtext: `+${goldenTrade.pnlPercent.toFixed(1)}% return. The tournament's single best trade so far.`,
      timestamp: goldenTrade.timestamp,
      severity: "hype",
    });
  }

  // Sort by severity then timestamp
  const severityOrder: Record<NarrativeSeverity, number> = {
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

function formatRound(round: string): string {
  const names: Record<string, string> = {
    "round-of-16": "Round of 16",
    quarterfinal: "Quarter-Final",
    semifinal: "Semi-Final",
    final: "Final",
    "third-place": "Third-Place Playoff",
    redemption: "Redemption Match",
  };
  return names[round] ?? round;
}
