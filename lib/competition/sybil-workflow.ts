/**
 * Sybil Workflow Orchestrator
 *
 * Runs all three sybil detection heuristics from `sybil-detector.ts` against
 * real position data for a cohort, merges results, and optionally persists
 * flags to the database.
 */

import {
  detectSybilClusters,
  detectTradingPatternCorrelation,
  detectPnlMirroring,
  applyConvergenceFilter,
  type WalletInfo,
  type TradeTimestampProfile,
  type PnlProfile,
  type SybilCluster,
} from "./sybil-detector.ts";
import { flagSybil } from "../db/queries.ts";
import { getRpcUrl } from "../solana/cluster.ts";
import type { AdrenaPosition } from "../adrena/client.ts";

// ── Result type ──────────────────────────────────────────────────────────────

export interface SybilDetectionResult {
  cohortId: string;
  totalFlags: number;
  clusters: SybilCluster[];
  flaggedWallets: string[];
}

// ── Profile builders ─────────────────────────────────────────────────────────

/**
 * Extract trade timestamps from positions within the competition window.
 * Uses both entry_date and exit_date to capture full trading cadence.
 */
function buildTradeTimestampProfiles(
  wallets: string[],
  positionsByWallet: Map<string, AdrenaPosition[]>,
  windowStart: Date,
  windowEnd: Date
): TradeTimestampProfile[] {
  const startMs = windowStart.getTime();
  const endMs = windowEnd.getTime();

  return wallets
    .map((wallet) => {
      const positions = positionsByWallet.get(wallet) ?? [];
      const timestamps: number[] = [];

      for (const pos of positions) {
        const entryMs = new Date(pos.entry_date).getTime();
        if (entryMs >= startMs && entryMs <= endMs) {
          timestamps.push(entryMs);
        }

        if (pos.exit_date) {
          const exitMs = new Date(pos.exit_date).getTime();
          if (exitMs >= startMs && exitMs <= endMs) {
            timestamps.push(exitMs);
          }
        }
      }

      timestamps.sort((a, b) => a - b);
      return { wallet, timestamps };
    })
    .filter((p) => p.timestamps.length >= 2);
}

/**
 * Compute PnL% for each wallet from closed positions within the window.
 * Mirrors the logic in `lib/adrena/metrics.ts` but returns only the fields
 * needed for the PnL mirroring heuristic.
 */
function buildPnlProfiles(
  wallets: string[],
  positionsByWallet: Map<string, AdrenaPosition[]>,
  windowStart: Date,
  windowEnd: Date
): PnlProfile[] {
  const startMs = windowStart.getTime();
  const endMs = windowEnd.getTime();

  return wallets
    .map((wallet) => {
      const positions = positionsByWallet.get(wallet) ?? [];

      const closed = positions.filter((pos) => {
        if (
          (pos.status !== "close" && pos.status !== "liquidate") ||
          !pos.exit_date ||
          pos.pnl === null
        )
          return false;
        const exitMs = new Date(pos.exit_date).getTime();
        return exitMs >= startMs && exitMs <= endMs;
      }) as (AdrenaPosition & { pnl: number })[];

      if (closed.length === 0) return { wallet, pnlPercent: 0 };

      const totalPnl = closed.reduce((sum, p) => sum + p.pnl, 0);
      const totalCollateral = closed.reduce(
        (sum, p) => sum + p.collateral_amount,
        0
      );
      const pnlPercent =
        totalCollateral > 0 ? (totalPnl / totalCollateral) * 100 : 0;

      return { wallet, pnlPercent: Number(pnlPercent.toFixed(2)) };
    })
    .filter((p) => p.pnlPercent !== 0);
}

/**
 * Resolve the real funding source for a wallet by inspecting its earliest
 * inbound SOL transfer on-chain via the Solana RPC.
 *
 * Falls back to "unknown" if the RPC is unreachable or the wallet has no
 * inbound transfers (e.g., created via a program invocation).
 */
export async function resolveFundingSource(
  address: string
): Promise<{ source: string; fundedAt: number }> {
  const rpcUrl = getRpcUrl();

  try {
    // Fetch the oldest confirmed signatures for this address (limit 1, ascending)
    const sigsRes = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getSignaturesForAddress",
        params: [address, { limit: 1 }],
      }),
    });
    const sigsJson = await sigsRes.json();
    const sigs = sigsJson?.result;
    if (!sigs || sigs.length === 0) {
      return { source: "unknown", fundedAt: Date.now() };
    }

    const sig = sigs[0].signature;
    const blockTime = sigs[0].blockTime ?? Math.floor(Date.now() / 1000);

    // Fetch the full transaction to find the funding source
    const txRes = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        method: "getTransaction",
        params: [sig, { encoding: "jsonParsed", maxSupportedTransactionVersion: 0 }],
      }),
    });
    const txJson = await txRes.json();
    const tx = txJson?.result;

    if (!tx?.transaction?.message?.accountKeys) {
      return { source: "unknown", fundedAt: blockTime * 1000 };
    }

    // The fee payer (first account key) of the earliest transaction is the
    // most likely funding source for this wallet.
    const accountKeys = tx.transaction.message.accountKeys;
    const feePayer =
      typeof accountKeys[0] === "string"
        ? accountKeys[0]
        : accountKeys[0]?.pubkey ?? "unknown";

    return {
      source: feePayer === address ? "self-funded" : feePayer,
      fundedAt: blockTime * 1000,
    };
  } catch (err) {
    console.warn(
      `[sybil-workflow] RPC funding source lookup failed for ${address}: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
    return { source: "unknown", fundedAt: Date.now() };
  }
}

// In-memory cache to avoid redundant RPC calls within a single detection run
const fundingSourceCache = new Map<string, { source: string; fundedAt: number }>();

/**
 * Build WalletInfo entries with real funding source data from Solana RPC.
 * Falls back to "unknown" per-wallet on RPC failure (graceful degradation).
 */
export async function buildWalletInfos(
  wallets: string[],
  windowStart: Date
): Promise<WalletInfo[]> {
  const ts = windowStart.getTime();
  const results: WalletInfo[] = [];

  // Process in batches of 5 to avoid RPC rate limits
  const BATCH_SIZE = 5;
  for (let i = 0; i < wallets.length; i += BATCH_SIZE) {
    const batch = wallets.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(
      batch.map(async (address) => {
        let cached = fundingSourceCache.get(address);
        if (!cached) {
          cached = await resolveFundingSource(address);
          fundingSourceCache.set(address, cached);
        }
        return {
          address,
          fundingSource: cached.source,
          fundedAt: cached.fundedAt,
          entryTimestamp: ts,
        };
      })
    );
    results.push(...batchResults);
  }

  return results;
}

// ── Persistence ──────────────────────────────────────────────────────────────

/**
 * Persist flagged clusters to the database via `flagSybil`.
 * Each flagged wallet × flag code is upserted; failures are logged but
 * do not abort the workflow (the DB may not be configured).
 */
async function persistFlags(
  cohortId: string,
  clusters: SybilCluster[]
): Promise<number> {
  let persisted = 0;

  for (const cluster of clusters) {
    if (!cluster.flagged) continue;

    const flagCode =
      cluster.fundingSource === "pattern-correlation"
        ? "TRADE_PATTERN"
        : cluster.fundingSource === "pnl-mirroring"
          ? "PNL_MIRROR"
          : "FUNDING_CLUSTER";

    for (const wallet of cluster.wallets) {
      try {
        const result = await flagSybil({
          wallet,
          cohortId,
          flagCode,
          reason: cluster.reason,
          confidence: cluster.confidence,
        });
        if (result) persisted++;
      } catch (err) {
        console.warn(
          `[sybil-workflow] Could not persist flag for ${wallet}: ${
            err instanceof Error ? err.message : String(err)
          }`
        );
      }
    }
  }

  return persisted;
}

// ── Main entry point ─────────────────────────────────────────────────────────

/**
 * Run the full sybil detection pipeline for a single cohort.
 *
 * 1. Build profiles from real position data
 * 2. Run all three heuristics
 * 3. Merge & deduplicate results
 * 4. Optionally persist flags to the database
 */
export async function runSybilDetection(
  cohortId: string,
  wallets: string[],
  positionsByWallet: Map<string, AdrenaPosition[]>,
  windowStart: Date,
  windowEnd: Date
): Promise<SybilDetectionResult> {
  // 1 — Build profiles from position data
  const tradeProfiles = buildTradeTimestampProfiles(
    wallets,
    positionsByWallet,
    windowStart,
    windowEnd
  );

  const pnlProfiles = buildPnlProfiles(
    wallets,
    positionsByWallet,
    windowStart,
    windowEnd
  );

  const walletInfos = await buildWalletInfos(wallets, windowStart);

  // 2 — Run heuristics
  console.log(
    `[sybil-workflow] Cohort ${cohortId}: ${wallets.length} wallets, ` +
      `${tradeProfiles.length} trade profiles, ${pnlProfiles.length} PnL profiles`
  );

  const unknownCount = walletInfos.filter((w) => w.fundingSource === "unknown").length;
  if (unknownCount > 0) {
    console.log(
      `[sybil-workflow] ${unknownCount}/${wallets.length} wallets have unknown funding source ` +
        "(RPC lookup failed or no inbound transfers). " +
        "For production, configure Helius webhooks for real-time funding data."
    );
  }
  const fundingClusters = detectSybilClusters(walletInfos);

  const patternClusters = detectTradingPatternCorrelation(tradeProfiles);
  const pnlClusters = detectPnlMirroring(pnlProfiles);

  // 3 — Merge all clusters and apply convergence filter.
  // A wallet is only flagged if it appears in clusters from all 3 distinct
  // heuristic types. Any single heuristic alone is not enough — this prevents
  // false positives from a single noisy signal.
  const allClusters = [...fundingClusters, ...patternClusters, ...pnlClusters];
  const flaggedSet = applyConvergenceFilter(allClusters, 3);

  console.log(
    `[sybil-workflow] Cohort ${cohortId}: ${allClusters.length} clusters, ` +
      `${flaggedSet.size} converged-flagged wallets (3 heuristics)`
  );

  // 4 — Persist only converged flags (best-effort; DB may not be configured)
  // Filter clusters to only include wallets that passed convergence
  if (flaggedSet.size > 0) {
    const convergedClusters = allClusters
      .filter((c) => c.flagged)
      .map((c) => ({
        ...c,
        wallets: c.wallets.filter((w) => flaggedSet.has(w)),
      }))
      .filter((c) => c.wallets.length > 0);

    const persisted = await persistFlags(cohortId, convergedClusters);
    console.log(
      `[sybil-workflow] Persisted ${persisted} converged flag(s) to database`
    );
  }

  return {
    cohortId,
    totalFlags: flaggedSet.size,
    clusters: allClusters,
    flaggedWallets: Array.from(flaggedSet),
  };
}
