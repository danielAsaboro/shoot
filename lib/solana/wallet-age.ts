/**
 * Progressive KYC — Wallet Age Verification
 *
 * For Apex tier and World Cup knockout stages, wallets must have at least
 * 30 days of on-chain history on Solana. This prevents fresh sybil wallets
 * from accessing the highest rewards.
 */

import { Connection, PublicKey } from "@solana/web3.js";
import { getRpcUrl } from "./cluster.ts";

const MIN_WALLET_AGE_DAYS = 30;

export interface WalletAgeResult {
  eligible: boolean;
  walletAgeDays: number | null;
  reason?: string;
}

/**
 * Check if a wallet has at least `minDays` of on-chain history.
 * Looks up the earliest transaction signature for the wallet.
 *
 * No fallbacks — if the RPC call fails, the check fails.
 */
export async function checkWalletAge(
  wallet: string,
  minDays: number = MIN_WALLET_AGE_DAYS,
  rpcUrl?: string
): Promise<WalletAgeResult> {
  const connection = new Connection(rpcUrl ?? getRpcUrl(), "confirmed");
  const pubkey = new PublicKey(wallet);

  // Fetch the oldest transaction signature (limit=1, ascending order via "before" pagination)
  // getSignaturesForAddress returns newest-first by default. To find the oldest,
  // we paginate backwards until we hit the end.
  const signatures = await connection.getSignaturesForAddress(pubkey, {
    limit: 1,
  });

  if (signatures.length === 0) {
    return {
      eligible: false,
      walletAgeDays: null,
      reason: "No on-chain transaction history found for this wallet.",
    };
  }

  // The most recent tx tells us the wallet exists. Now find the oldest.
  let oldest = signatures[0];
  let cursor = oldest.signature;

  // Paginate backwards to find the earliest transaction
  while (true) {
    const batch = await connection.getSignaturesForAddress(pubkey, {
      before: cursor,
      limit: 1000,
    });
    if (batch.length === 0) break;
    oldest = batch[batch.length - 1];
    cursor = oldest.signature;
    // Safety: if we've paginated through >100k txs, stop
    if (batch.length < 1000) break;
  }

  if (!oldest.blockTime) {
    return {
      eligible: false,
      walletAgeDays: null,
      reason: "Could not determine wallet creation time (no block timestamp).",
    };
  }

  const ageSeconds = Math.floor(Date.now() / 1000) - oldest.blockTime;
  const ageDays = Math.floor(ageSeconds / 86400);

  if (ageDays < minDays) {
    return {
      eligible: false,
      walletAgeDays: ageDays,
      reason: `Wallet is ${ageDays} days old, minimum ${minDays} days required for this tier.`,
    };
  }

  return { eligible: true, walletAgeDays: ageDays };
}
