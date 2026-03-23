#!/usr/bin/env npx tsx
/**
 * Mini-Competition Runner
 *
 * Fetches live positions from the Adrena Data API for a curated set of
 * active wallets, scores them with the full tournament + Mutagen engines,
 * runs sybil/pattern/PnL-mirroring checks, and outputs a markdown report.
 *
 * Usage:
 *   npx tsx scripts/run-mini-competition.ts          # print to stdout
 *   npx tsx scripts/run-mini-competition.ts --save    # also write docs/mini-competition-results.md
 */

import fs from "node:fs/promises";
import path from "node:path";

import { fetchPositions, type AdrenaPosition } from "../lib/adrena/client.ts";
import { computeMetricsFromPositions } from "../lib/adrena/metrics.ts";
import { computeTournamentScore } from "../lib/competition/engine.ts";
import { computeAggregateMutagen } from "../lib/competition/mutagen.ts";
import {
  detectTradingPatternCorrelation,
  detectPnlMirroring,
  type TradeTimestampProfile,
  type PnlProfile,
} from "../lib/competition/sybil-detector.ts";

// ── Configuration ────────────────────────────────────────────────────────────

const SAVE_FLAG = process.argv.includes("--save");
const OUTPUT_PATH = path.join(
  process.cwd(),
  "docs",
  "mini-competition-results.md"
);

/** Competition window: last 14 days from now. */
const WINDOW_DAYS = 14;
const windowEnd = new Date();
const windowStart = new Date(
  windowEnd.getTime() - WINDOW_DAYS * 24 * 60 * 60 * 1000
);

/**
 * Curated wallet list — wallets from competition-cohorts.json that showed
 * real trading activity in the live validation report.
 */
const WALLETS: string[] = [
  "ErVgLQB4hwGe9xegP6R83E6WE1tcRokcsEY1WT9xa9po",
  "8anmrYFmdX6ZUX6ceLfDV7vxuGtnG1v77uqGnjTkf6Wy",
  "GZXqnVpZuyKWdUH34mgijxJVM1LEngoGWoJzEXtXGhBb",
  "56yW76VPSviUX5YnVnTmxfWYvg9nsAN2c7iUyx8uCcoS",
  "4N69yzFFVrdqBuQi81fdJ7w7JdX5t2hpwKh6potdKMX4",
  "C9jxD53Thg73XgTeb2ehh2LcNjWFs4Pa1jaBCtBgcHnt",
  "4QLQUhJEqML1cLvS3baGrHP2TJHjXgUQLE7d2LCGLsLu",
  "7QYoineP55hDmikbPUwsZ57sErE1ztTvhMhwCk8zV5Pu",
  "F179GtjoSKgeLDkFR2B5cCN4oTqFpkzQuboonojJb5Z1",
  "6ALGMay8AmcywGAX72ho7JbSucD7zeh4hwMVyXDb9zgy",
  "DWcFRJrpzsrn624983W3qTuYccYnwLnL582gQ8CLohvY",
  "sigMag9SUGdtwwcH23QDkA3tUCEKTnrSKLcZwF3V4ig",
  "HjcswYCPRK576h8fJsQLALuYS4GzEyycaTRy2zCyNjqW",
];

// ── Helpers ──────────────────────────────────────────────────────────────────

function walletShort(wallet: string): string {
  if (wallet.length < 8) return wallet;
  return `${wallet.slice(0, 4)}...${wallet.slice(-4)}`;
}

function walletToBadge(wallet: string): string {
  const badges = [
    "Perp Trader",
    "Market Maker",
    "Swing Trader",
    "Scalper",
    "Position Trader",
  ];
  return badges[wallet.charCodeAt(0) % badges.length];
}

function formatUsd(value: number): string {
  if (Math.abs(value) >= 1_000_000)
    return `$${(value / 1_000_000).toFixed(2)}M`;
  if (Math.abs(value) >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

// ── Types ────────────────────────────────────────────────────────────────────

interface WalletResult {
  wallet: string;
  short: string;
  positions: AdrenaPosition[];
  tradeCount: number;
  pnlPercent: number;
  volumeUsd: number;
  winRate: number;
  consistencyScore: number;
  maxDrawdownPercent: number;
  tournamentScore: number;
  totalMutagen: number;
  error?: string;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.error(
    `[mini-competition] Window: ${windowStart.toISOString()} → ${windowEnd.toISOString()}`
  );
  console.error(`[mini-competition] Wallets: ${WALLETS.length}`);
  console.error("");

  // 1. Fetch positions for all wallets (parallel, with error handling)
  const results: WalletResult[] = [];

  const fetches = WALLETS.map(async (wallet) => {
    const short = walletShort(wallet);
    try {
      console.error(`  Fetching ${short}...`);
      const positions = await fetchPositions(wallet);

      // 2. Compute metrics
      const perf = computeMetricsFromPositions(
        positions,
        windowStart,
        windowEnd
      );

      // Tournament score
      const tournamentScore = computeTournamentScore({
        wallet,
        displayName: short,
        badge: walletToBadge(wallet),
        performance: perf,
        seasonPoints: 0,
        fundedStatus: "none",
        questProgress: [],
        streakDays: 0,
        streakState: "broken",
        raffleTickets: 0,
        abuseFlags: [],
      });

      // Mutagen
      const mutagen = computeAggregateMutagen(
        positions,
        windowStart,
        windowEnd
      );

      results.push({
        wallet,
        short,
        positions,
        tradeCount: perf.tradeCount ?? 0,
        pnlPercent: perf.pnlPercent,
        volumeUsd: perf.volumeUsd,
        winRate: perf.winRate,
        consistencyScore: perf.consistencyScore,
        maxDrawdownPercent: perf.maxDrawdownPercent,
        tournamentScore: Number(tournamentScore.toFixed(2)),
        totalMutagen: mutagen.totalMutagen,
      });

      console.error(
        `    → ${positions.length} positions, ${perf.tradeCount ?? 0} in window`
      );
    } catch (err) {
      console.error(
        `    → ERROR: ${err instanceof Error ? err.message : String(err)}`
      );
      results.push({
        wallet,
        short,
        positions: [],
        tradeCount: 0,
        pnlPercent: 0,
        volumeUsd: 0,
        winRate: 0,
        consistencyScore: 0,
        maxDrawdownPercent: 0,
        tournamentScore: 0,
        totalMutagen: 0,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  await Promise.all(fetches);

  // Sort by tournament score descending
  results.sort((a, b) => b.tournamentScore - a.tournamentScore);

  // 3. Sybil checks
  console.error("\n[mini-competition] Running sybil analysis...");

  // Trading pattern correlation
  const tradeProfiles: TradeTimestampProfile[] = results.map((r) => ({
    wallet: r.wallet,
    timestamps: r.positions
      .filter((p) => p.exit_date)
      .map((p) => new Date(p.exit_date!).getTime()),
  }));
  const patternClusters = detectTradingPatternCorrelation(tradeProfiles);

  // PnL mirroring
  const pnlProfiles: PnlProfile[] = results.map((r) => ({
    wallet: r.wallet,
    pnlPercent: r.pnlPercent,
  }));
  const mirrorClusters = detectPnlMirroring(pnlProfiles);

  const allClusters = [...patternClusters, ...mirrorClusters];
  const flaggedClusters = allClusters.filter((c) => c.flagged);

  console.error(`  Pattern correlation clusters: ${patternClusters.length}`);
  console.error(`  PnL mirroring clusters: ${mirrorClusters.length}`);
  console.error(`  Total flagged: ${flaggedClusters.length}`);

  // 4. Generate markdown report
  const activeResults = results.filter((r) => !r.error);
  const failedResults = results.filter((r) => r.error);

  let md = `## Mini-Competition Results (Live Data)
**Run date:** ${new Date().toISOString()}
**Window:** ${windowStart.toISOString().slice(0, 10)} - ${windowEnd.toISOString().slice(0, 10)}
**Wallets:** ${WALLETS.length} queried, ${activeResults.length} successful, ${failedResults.length} failed

### Leaderboard
| Rank | Wallet | Trades | PnL% | Volume | Win% | Consistency | Drawdown | Tournament Score | Mutagen |
|------|--------|--------|------|--------|------|-------------|----------|------------------|---------|
`;

  results.forEach((r, idx) => {
    if (r.error) {
      md += `| ${idx + 1} | ${r.short} | — | — | — | — | — | — | _(fetch error)_ | — |\n`;
    } else {
      md += `| ${idx + 1} | ${r.short} | ${r.tradeCount} | ${r.pnlPercent.toFixed(1)}% | ${formatUsd(r.volumeUsd)} | ${r.winRate.toFixed(1)}% | ${r.consistencyScore.toFixed(1)} | ${r.maxDrawdownPercent.toFixed(1)}% | ${r.tournamentScore.toFixed(2)} | ${r.totalMutagen.toFixed(4)} |\n`;
    }
  });

  md += `\n### Sybil Analysis\n`;

  if (flaggedClusters.length === 0) {
    md += `No suspicious patterns detected across ${WALLETS.length} wallets.\n`;
  } else {
    md += `**${flaggedClusters.length} flagged cluster(s) detected:**\n\n`;
    for (const cluster of flaggedClusters) {
      const walletList = cluster.wallets.map(walletShort).join(", ");
      md += `- **${cluster.confidence} confidence** (${cluster.fundingSource}): ${walletList}\n`;
      md += `  Reason: ${cluster.reason}\n`;
    }
  }

  if (failedResults.length > 0) {
    md += `\n### Fetch Errors\n`;
    for (const r of failedResults) {
      md += `- \`${r.short}\`: ${r.error}\n`;
    }
  }

  md += `\n### Score Formula Reference\n`;
  md += `- **Tournament:** (PnL% x 8.5) + (log10(volume) x 6) + (consistency x 0.28) + (winRate x 0.08) - (drawdown x 0.65)\n`;
  md += `- **Mutagen:** Sum of per-trade (Performance + Duration) x Size Multiplier\n`;

  // Output to stdout
  console.log(md);

  // 5. Optionally save to file
  if (SAVE_FLAG) {
    await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
    await fs.writeFile(OUTPUT_PATH, md, "utf-8");
    console.error(`\n[mini-competition] Saved to ${OUTPUT_PATH}`);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
