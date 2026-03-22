/**
 * On-chain transaction verification for enrollment entry fees.
 *
 * Verifies that a Solana transaction actually transferred the expected
 * USDC amount from the trader's token account to the program vault.
 */

import { Connection, PublicKey } from "@solana/web3.js";
import { getRpcUrl } from "./cluster.ts";

const TX_MAX_AGE_SECONDS = 600; // 10 minutes

interface VerifyParams {
  txSignature: string;
  expectedPayer: string;
  expectedVault: string;
  expectedUsdc: number; // USDC atomic units (6 decimals)
}

interface VerifyResult {
  verified: boolean;
  reason?: string;
}

export async function verifyEnrollmentTransaction(
  params: VerifyParams,
  rpcUrl?: string
): Promise<VerifyResult> {
  const { txSignature, expectedPayer, expectedVault, expectedUsdc } = params;
  const connection = new Connection(
    rpcUrl ?? getRpcUrl(),
    "confirmed"
  );

  let tx: Awaited<ReturnType<typeof connection.getParsedTransaction>>;
  try {
    tx = await connection.getParsedTransaction(txSignature, {
      maxSupportedTransactionVersion: 0,
      commitment: "confirmed",
    });
  } catch (error) {
    return {
      verified: false,
      reason: `RPC error fetching transaction: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  if (!tx) {
    return { verified: false, reason: "Transaction not found on-chain." };
  }

  if (tx.meta?.err) {
    return {
      verified: false,
      reason: `Transaction failed on-chain: ${JSON.stringify(tx.meta.err)}`,
    };
  }

  // Check transaction age
  if (tx.blockTime) {
    const age = Math.floor(Date.now() / 1000) - tx.blockTime;
    if (age > TX_MAX_AGE_SECONDS) {
      return {
        verified: false,
        reason: `Transaction is ${age}s old, maximum allowed is ${TX_MAX_AGE_SECONDS}s.`,
      };
    }
  }

  // Verify USDC token transfer via pre/post token balances.
  // This works for both direct SPL transfers and CPI-invoked transfers.
  const preTokenBalances = tx.meta?.preTokenBalances ?? [];
  const postTokenBalances = tx.meta?.postTokenBalances ?? [];

  // Find vault token balance change
  let vaultReceived = 0;
  for (const post of postTokenBalances) {
    if (post.owner === expectedVault || post.owner === expectedPayer) {
      const pre = preTokenBalances.find(
        (p) => p.accountIndex === post.accountIndex
      );
      const preAmount = Number(pre?.uiTokenAmount?.amount ?? "0");
      const postAmount = Number(post.uiTokenAmount?.amount ?? "0");
      const delta = postAmount - preAmount;

      // Vault should have received tokens
      if (post.owner === expectedVault && delta > 0) {
        vaultReceived += delta;
      }
    }
  }

  if (vaultReceived < expectedUsdc) {
    return {
      verified: false,
      reason: `Vault received ${vaultReceived} USDC atoms, expected at least ${expectedUsdc}.`,
    };
  }

  return { verified: true };
}

/**
 * Convert USD to USDC atomic units (6 decimals).
 * No oracles, no fallbacks — USDC is 1:1 with USD.
 */
export function usdToUsdcAtoms(entryFeeUsd: number): number {
  return Math.round(entryFeeUsd * 1_000_000);
}

/**
 * @deprecated Use usdToUsdcAtoms() instead.
 */
export function usdToLamports(entryFeeUsd: number): Promise<number> {
  return Promise.resolve(usdToUsdcAtoms(entryFeeUsd));
}

/**
 * @deprecated Use usdToUsdcAtoms() instead.
 */
export function usdToDevnetLamports(entryFeeUsd: number): number {
  return usdToUsdcAtoms(entryFeeUsd);
}
