/**
 * Sybil Detection — Heuristic Engine
 *
 * Detects coordinated wallet clusters that may be operating as a single
 * entity to farm competition rewards. Three uncorrelated heuristics:
 *
 * 1. **Funding source clustering** (`detectSybilClusters`) — wallets funded
 *    from the same address within a 1-hour window are grouped. Clusters of
 *    3+ wallets are flagged; synchronized competition entry elevates confidence.
 * 2. **Trading pattern correlation** (`detectTradingPatternCorrelation`) —
 *    pairwise Pearson correlation of trade timestamps. Correlation > 0.85
 *    indicates bot-controlled wallets executing on similar schedules.
 * 3. **P&L mirroring** (`detectPnlMirroring`) — detects wallet pairs with
 *    opposite P&L profiles (within 2%), indicating potential wash trading
 *    where one wallet intentionally loses to boost another.
 *
 * A convergence filter (`applyConvergenceFilter`) requires a wallet to appear
 * in clusters from all 3 heuristic types before it is flagged — any single
 * signal alone is not enough. In a full deployment, funding records would
 * come from Helius webhooks or a transaction indexer.
 */

// ── Types ────────────────────────────────────────────────────────────────────

export interface WalletInfo {
  /** Wallet public key. */
  address: string;
  /** Address that funded this wallet (first incoming SOL transfer). */
  fundingSource: string;
  /** Timestamp of the first funding transaction. */
  fundedAt: number; // unix ms
  /** Timestamp of competition entry. */
  entryTimestamp: number; // unix ms
}

export type HeuristicType = "funding" | "pattern" | "pnl_mirror";

export interface SybilCluster {
  /** Which detection heuristic produced this cluster. */
  heuristicType: HeuristicType;
  /** Shared funding source address. */
  fundingSource: string;
  /** Wallets in this cluster. */
  wallets: string[];
  /** Number of wallets in the cluster. */
  size: number;
  /** Whether this cluster is flagged (3+ wallets = flagged). */
  flagged: boolean;
  /** Human-readable reason for the flag. */
  reason: string;
  /** Confidence level based on heuristic strength. */
  confidence: "low" | "medium" | "high";
}

// ── Constants ────────────────────────────────────────────────────────────────

/** Wallets funded within this window from the same source are clustered. */
const FUNDING_WINDOW_MS = 60 * 60 * 1000; // 1 hour

/** Minimum cluster size to trigger a flag. */
const FLAG_THRESHOLD = 3;

/** Entry timestamps within this window raise suspicion. */
const ENTRY_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

// ── Detection ────────────────────────────────────────────────────────────────

/**
 * Detect sybil clusters from a set of wallet funding records.
 *
 * Heuristics applied:
 * 1. **Same funding source within 1 hour** — wallets funded from the same
 *    address within a 1-hour window are grouped into a cluster.
 * 2. **3+ wallets = flagged** — clusters with 3 or more wallets are flagged
 *    for manual review.
 * 3. **Identical entry timestamps** — if all wallets in a cluster entered
 *    the competition within 5 minutes, confidence is elevated to "high".
 *
 * @param wallets - Array of wallet funding information
 * @returns Array of detected sybil clusters (may be empty)
 */
export function detectSybilClusters(wallets: WalletInfo[]): SybilCluster[] {
  // Group wallets by funding source
  const sourceGroups = new Map<string, WalletInfo[]>();

  for (const wallet of wallets) {
    const group = sourceGroups.get(wallet.fundingSource) ?? [];
    group.push(wallet);
    sourceGroups.set(wallet.fundingSource, group);
  }

  const clusters: SybilCluster[] = [];

  for (const [source, group] of sourceGroups) {
    if (group.length < 2) continue;

    // Sort by funding time to check temporal proximity
    const sorted = [...group].sort((a, b) => a.fundedAt - b.fundedAt);

    // Find wallets funded within the window
    const clustered: WalletInfo[] = [];
    for (let i = 0; i < sorted.length; i++) {
      const windowMembers = sorted.filter(
        (w) => Math.abs(w.fundedAt - sorted[i].fundedAt) <= FUNDING_WINDOW_MS
      );
      if (windowMembers.length >= 2) {
        for (const m of windowMembers) {
          if (!clustered.some((c) => c.address === m.address)) {
            clustered.push(m);
          }
        }
      }
    }

    if (clustered.length < 2) continue;

    // Check if entry timestamps are suspiciously close
    const entryTimes = clustered.map((w) => w.entryTimestamp);
    const entrySpread = Math.max(...entryTimes) - Math.min(...entryTimes);
    const tightEntry = entrySpread <= ENTRY_WINDOW_MS;

    const flagged = clustered.length >= FLAG_THRESHOLD;
    const confidence: SybilCluster["confidence"] =
      flagged && tightEntry ? "high"
      : flagged ? "medium"
      : "low";

    const reason = flagged
      ? `${clustered.length} wallets funded from ${source.slice(0, 8)}... within ${Math.round(FUNDING_WINDOW_MS / 60000)} min${tightEntry ? ", with synchronized competition entry" : ""}`
      : `${clustered.length} wallets share funding source ${source.slice(0, 8)}... (below flag threshold)`;

    clusters.push({
      heuristicType: "funding",
      fundingSource: source,
      wallets: clustered.map((w) => w.address),
      size: clustered.length,
      flagged,
      reason,
      confidence,
    });
  }

  return clusters;
}

/**
 * Quick check: does a single wallet appear in any flagged cluster?
 *
 * @param wallet - The wallet address to check
 * @param clusters - Pre-computed sybil clusters
 * @returns true if the wallet is in a flagged cluster
 */
export function isWalletFlagged(wallet: string, clusters: SybilCluster[]): boolean {
  return clusters.some((c) => c.flagged && c.wallets.includes(wallet));
}

// ── Trading Pattern Correlation ─────────────────────────────────────────────

export interface TradeTimestampProfile {
  wallet: string;
  timestamps: number[]; // unix ms of each trade
}

/** Pearson correlation threshold for flagging correlated trading patterns. */
const PATTERN_CORRELATION_THRESHOLD = 0.85;

/**
 * Compute Pearson correlation coefficient between two numeric arrays.
 * Returns 0 if either array has zero variance.
 */
function pearsonCorrelation(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 3) return 0;

  const xs = a.slice(0, n);
  const ys = b.slice(0, n);

  const meanX = xs.reduce((s, v) => s + v, 0) / n;
  const meanY = ys.reduce((s, v) => s + v, 0) / n;

  let num = 0;
  let denomX = 0;
  let denomY = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - meanX;
    const dy = ys[i] - meanY;
    num += dx * dy;
    denomX += dx * dx;
    denomY += dy * dy;
  }

  const denom = Math.sqrt(denomX * denomY);
  return denom === 0 ? 0 : num / denom;
}

/** Maximum profiles to compare pairwise per batch. Larger cohorts are chunked. */
const MAX_PAIRWISE_BATCH = 100;

/**
 * Check if two wallets have overlapping active time windows.
 * Used as a fast pre-filter to skip Pearson correlation for wallets
 * that traded at completely different times.
 */
function hasActivityOverlap(a: TradeTimestampProfile, b: TradeTimestampProfile): boolean {
  if (a.timestamps.length === 0 || b.timestamps.length === 0) return false;
  const aMin = a.timestamps[0];
  const aMax = a.timestamps[a.timestamps.length - 1];
  const bMin = b.timestamps[0];
  const bMax = b.timestamps[b.timestamps.length - 1];
  // Intervals overlap if aMin <= bMax && bMin <= aMax
  return aMin <= bMax && bMin <= aMax;
}

/**
 * Detect wallets with highly correlated trade timing (Pearson > 0.85).
 * Indicates bot-controlled wallets executing on similar schedules.
 *
 * Performance: pre-filters by activity overlap (O(n) check) before
 * running Pearson correlation, and processes in batches of MAX_PAIRWISE_BATCH
 * to bound worst-case comparison count.
 */
export function detectTradingPatternCorrelation(
  profiles: TradeTimestampProfile[]
): SybilCluster[] {
  const clusters: SybilCluster[] = [];
  const flagged = new Set<string>();

  // Process in batches to bound comparisons
  for (let batchStart = 0; batchStart < profiles.length; batchStart += MAX_PAIRWISE_BATCH) {
    const batch = profiles.slice(batchStart, batchStart + MAX_PAIRWISE_BATCH);

    for (let i = 0; i < batch.length; i++) {
      for (let j = i + 1; j < batch.length; j++) {
        const a = batch[i];
        const b = batch[j];

        // Early exit: skip pairs with no temporal overlap
        if (!hasActivityOverlap(a, b)) continue;

        const corr = pearsonCorrelation(a.timestamps, b.timestamps);

        if (corr >= PATTERN_CORRELATION_THRESHOLD && !flagged.has(`${a.wallet}-${b.wallet}`)) {
          flagged.add(`${a.wallet}-${b.wallet}`);
          clusters.push({
            heuristicType: "pattern",
            fundingSource: "pattern-correlation",
            wallets: [a.wallet, b.wallet],
            size: 2,
            flagged: true,
            reason: `Trading pattern correlation ${corr.toFixed(3)} exceeds ${PATTERN_CORRELATION_THRESHOLD} threshold`,
            confidence: corr >= 0.95 ? "high" : "medium",
          });
        }
      }
    }
  }

  return clusters;
}

// ── P&L Mirroring ───────────────────────────────────────────────────────────

export interface PnlProfile {
  wallet: string;
  pnlPercent: number;
}

/**
 * Detect wallet pairs with opposite P&L profiles in the same cohort.
 * Indicates potential wash trading where one wallet intentionally loses
 * to boost the other's performance.
 *
 * Optimization: splits profiles into positive and negative P&L buckets
 * first, then only compares across buckets (O(p×n) where p=positive,
 * n=negative, instead of O(total^2)).
 */
export function detectPnlMirroring(
  profiles: PnlProfile[]
): SybilCluster[] {
  const clusters: SybilCluster[] = [];
  const PNL_MIRROR_THRESHOLD = 2; // P&L magnitudes must be within 2% to flag

  // Split into positive and negative buckets — mirrors can only exist cross-bucket
  const positive = profiles.filter((p) => p.pnlPercent > 5);
  const negative = profiles.filter((p) => p.pnlPercent < -5);

  // Only compare positive vs negative (not all pairs)
  for (const a of positive) {
    for (const b of negative) {
      const sum = a.pnlPercent + b.pnlPercent;

      if (Math.abs(sum) <= PNL_MIRROR_THRESHOLD) {
        clusters.push({
          heuristicType: "pnl_mirror",
          fundingSource: "pnl-mirroring",
          wallets: [a.wallet, b.wallet],
          size: 2,
          flagged: true,
          reason: `Opposite P&L profiles detected: ${a.wallet.slice(0, 8)}... (${a.pnlPercent.toFixed(1)}%) vs ${b.wallet.slice(0, 8)}... (${b.pnlPercent.toFixed(1)}%)`,
          confidence: Math.abs(sum) <= 0.5 ? "high" : "medium",
        });
      }
    }
  }

  return clusters;
}

// ── Convergence Filter ──────────────────────────────────────────────────────

/**
 * Filter flagged wallets to only those appearing in clusters from >= minSignals
 * distinct heuristic types. This implements the "three weak signals needed
 * to flag" design: any single heuristic alone is not enough.
 *
 * @param clusters - All clusters from all heuristics
 * @param minSignals - Minimum number of distinct heuristic types required (default 3)
 * @returns Set of wallet addresses that meet the convergence threshold
 */
export function applyConvergenceFilter(
  clusters: SybilCluster[],
  minSignals: number = 3
): Set<string> {
  const signalMap = new Map<string, Set<HeuristicType>>();

  for (const cluster of clusters) {
    if (!cluster.flagged) continue;
    for (const wallet of cluster.wallets) {
      const signals = signalMap.get(wallet) ?? new Set<HeuristicType>();
      signals.add(cluster.heuristicType);
      signalMap.set(wallet, signals);
    }
  }

  const converged = new Set<string>();
  for (const [wallet, signals] of signalMap) {
    if (signals.size >= minSignals) {
      converged.add(wallet);
    }
  }

  return converged;
}
