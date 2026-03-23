/**
 * On-chain settlement execution — sends submit_result + settle_challenge
 * transactions to distribute USDC rewards to competition winners.
 *
 * Two-step process per trader:
 * 1. submit_result — record the off-chain scoring outcome on-chain
 * 2. settle_challenge — transfer USDC payout from vault to trader
 */

import {
  Connection,
  Keypair,
  PublicKey,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import { getAssociatedTokenAddress } from "@solana/spl-token";
import bs58 from "bs58";
import { getRpcUrl, isDevnet } from "./cluster.ts";
import {
  buildSubmitResultInstruction,
  buildSettleChallengeInstruction,
  findChallengePda,
  findVaultPda,
  findEnrollmentPda,
  USDC_MINT_MAINNET,
  USDC_MINT_DEVNET,
} from "./program.ts";

export interface SettlementEntry {
  wallet: string;
  passed: boolean;
  payoutUsdc: bigint; // USDC atomic units (6 decimals)
  finalPnlBps: number;
  finalDrawdownBps: number;
}

export interface SettlementResult {
  signatures: string[];
  errors: Array<{ wallet: string; error: string }>;
}

/**
 * Load the settlement authority keypair from the environment.
 * Expects SETTLE_AUTHORITY_KEYPAIR as a base58-encoded secret key.
 */
export function loadAuthorityKeypair(): Keypair {
  const encoded = process.env.SETTLE_AUTHORITY_KEYPAIR;
  if (!encoded) {
    throw new Error(
      "SETTLE_AUTHORITY_KEYPAIR env var not set. Cannot execute on-chain settlement."
    );
  }
  return Keypair.fromSecretKey(bs58.decode(encoded));
}

function getUsdcMint(): PublicKey {
  return isDevnet() ? USDC_MINT_DEVNET : USDC_MINT_MAINNET;
}

/**
 * Map pass/fail to EnrollmentStatus enum index for the on-chain program.
 * 0=Active, 1=Passed, 2=FailedDrawdown, 3=FailedDailyLimit, 4=FailedTimeout
 */
function toEnrollmentStatus(passed: boolean): number {
  return passed ? 1 : 4; // Passed or FailedTimeout (generic fail)
}

/**
 * Execute on-chain settlements: submit results then distribute USDC payouts.
 */
export async function executeSettlements(params: {
  authority: Keypair;
  challengeId: string;
  settlements: SettlementEntry[];
  rpcUrl?: string;
  dryRun?: boolean;
}): Promise<SettlementResult> {
  const { authority, challengeId, settlements, dryRun } = params;
  const connection = new Connection(params.rpcUrl ?? getRpcUrl(), "confirmed");

  const [challengePda] = findChallengePda(authority.publicKey, challengeId);
  const [vaultPda] = findVaultPda(challengePda);

  const signatures: string[] = [];
  const errors: Array<{ wallet: string; error: string }> = [];

  for (const entry of settlements) {
    try {
      const traderPk = new PublicKey(entry.wallet);
      const [enrollmentPda] = findEnrollmentPda(challengePda, traderPk);
      const traderUsdc = await getAssociatedTokenAddress(
        getUsdcMint(),
        traderPk
      );

      // Step 1: Submit result
      const submitIx = await buildSubmitResultInstruction({
        authority: authority.publicKey,
        challenge: challengePda,
        enrollment: enrollmentPda,
        status: toEnrollmentStatus(entry.passed),
        finalPnlBps: entry.finalPnlBps,
        finalDrawdownBps: entry.finalDrawdownBps,
      });

      // Step 2: Settle (only if passed with payout)
      const instructions = [submitIx];

      if (entry.passed && entry.payoutUsdc > BigInt(0)) {
        const settleIx = await buildSettleChallengeInstruction({
          authority: authority.publicKey,
          challenge: challengePda,
          trader: traderPk,
          traderUsdc,
          vault: vaultPda,
          payoutUsdc: entry.payoutUsdc,
        });
        instructions.push(settleIx);
      }

      const { blockhash } = await connection.getLatestBlockhash("confirmed");
      const messageV0 = new TransactionMessage({
        payerKey: authority.publicKey,
        recentBlockhash: blockhash,
        instructions,
      }).compileToV0Message();

      const tx = new VersionedTransaction(messageV0);
      tx.sign([authority]);

      if (dryRun) {
        const sim = await connection.simulateTransaction(tx);
        if (sim.value.err) {
          errors.push({
            wallet: entry.wallet,
            error: `Simulation failed: ${JSON.stringify(sim.value.err)}`,
          });
        } else {
          signatures.push(`dry-run-${entry.wallet.slice(0, 8)}`);
        }
      } else {
        const sig = await connection.sendTransaction(tx);
        await connection.confirmTransaction(sig, "confirmed");
        signatures.push(sig);
      }
    } catch (error) {
      errors.push({
        wallet: entry.wallet,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { signatures, errors };
}

/**
 * Convert USD to USDC atomic units (6 decimals).
 * 1 USD = 1_000_000 USDC atomic units.
 */
export function usdToUsdc(usd: number): bigint {
  return BigInt(Math.round(usd * 1_000_000));
}

/**
 * @deprecated Use usdToUsdc() instead.
 */
export function usdToLamports(usd: number): bigint {
  return usdToUsdc(usd);
}
