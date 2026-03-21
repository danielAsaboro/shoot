/**
 * ADX Buyback — Jupiter V6 Swap Execution
 *
 * Executes USDC → ADX swaps via Jupiter's V6 API as part of the
 * fee allocation pipeline. 25% of collected entry fees are used
 * to buy ADX on settlement.
 */

import {
  Connection,
  Keypair,
  VersionedTransaction,
} from "@solana/web3.js";
import { prisma } from "../db/client.ts";
import { calculateFeeAllocation } from "./engine.ts";

// ── Token Mints ─────────────────────────────────────────────────────────────

const ADX_MINT = "AuQaustGiaqxRvj2gtCdrd22PBzTn8kM3kEPEkZCtuDw";

const USDC_MINT_MAINNET = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const USDC_MINT_DEVNET = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";

const JUPITER_QUOTE_URL = "https://quote-api.jup.ag/v6/quote";
const JUPITER_SWAP_URL = "https://quote-api.jup.ag/v6/swap";

// ── Helpers ─────────────────────────────────────────────────────────────────

function getUsdcMint(): string {
  const cluster = process.env.NEXT_PUBLIC_SOLANA_CLUSTER ?? "devnet";
  return cluster === "mainnet" ? USDC_MINT_MAINNET : USDC_MINT_DEVNET;
}

function getRpcUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SOLANA_RPC ??
    (process.env.NEXT_PUBLIC_SOLANA_CLUSTER === "mainnet"
      ? "https://api.mainnet-beta.solana.com"
      : "https://api.devnet.solana.com")
  );
}

function loadBuybackKeypair(): Keypair {
  const raw = process.env.BUYBACK_WALLET_KEYPAIR;
  if (!raw) {
    throw new Error(
      "BUYBACK_WALLET_KEYPAIR env var is required for ADX buyback execution. " +
        "Set it to a JSON array of the wallet's secret key bytes."
    );
  }
  const secretKey = Uint8Array.from(JSON.parse(raw));
  return Keypair.fromSecretKey(secretKey);
}

// ── Jupiter Quote ───────────────────────────────────────────────────────────

interface JupiterQuote {
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  otherAmountThreshold: string;
  swapMode: string;
  slippageBps: number;
  routePlan: unknown[];
}

async function getJupiterQuote(
  amountUsdcAtomic: bigint,
  slippageBps: number = 100
): Promise<JupiterQuote> {
  const params = new URLSearchParams({
    inputMint: getUsdcMint(),
    outputMint: ADX_MINT,
    amount: amountUsdcAtomic.toString(),
    slippageBps: slippageBps.toString(),
  });

  const res = await fetch(`${JUPITER_QUOTE_URL}?${params}`);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Jupiter quote failed (${res.status}): ${body}`);
  }

  return res.json() as Promise<JupiterQuote>;
}

// ── Jupiter Swap ────────────────────────────────────────────────────────────

async function executeJupiterSwap(
  quote: JupiterQuote,
  userPublicKey: string
): Promise<string> {
  const res = await fetch(JUPITER_SWAP_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      quoteResponse: quote,
      userPublicKey,
      wrapAndUnwrapSol: false,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Jupiter swap failed (${res.status}): ${body}`);
  }

  const { swapTransaction } = (await res.json()) as {
    swapTransaction: string;
  };

  // Deserialize, sign, and send
  const txBuf = Buffer.from(swapTransaction, "base64");
  const tx = VersionedTransaction.deserialize(txBuf);

  const keypair = loadBuybackKeypair();
  tx.sign([keypair]);

  const connection = new Connection(getRpcUrl(), "confirmed");
  const signature = await connection.sendRawTransaction(tx.serialize(), {
    skipPreflight: false,
    maxRetries: 3,
  });

  // Wait for confirmation
  const latestBlockhash = await connection.getLatestBlockhash();
  await connection.confirmTransaction(
    { signature, ...latestBlockhash },
    "confirmed"
  );

  return signature;
}

// ── Public API ──────────────────────────────────────────────────────────────

export interface BuybackResult {
  amountUsd: number;
  amountUsdcAtomic: bigint;
  adxReceived: string;
  txSignature: string;
}

/**
 * Execute the ADX buyback for a settled cohort via Jupiter V6.
 *
 * Converts the buyback portion (25%) of collected entry fees from
 * USDC to ADX. Records the result in the database.
 *
 * @param cohortId - The settled cohort ID
 * @param totalFeesCollected - Total USDC fees collected for this cohort
 * @param dryRun - If true, fetch quote but skip execution (for testing)
 * @returns Buyback result with tx signature and ADX amount
 */
export async function executeBuyback(
  cohortId: string,
  totalFeesCollected: number,
  dryRun: boolean = false
): Promise<BuybackResult> {
  const allocation = calculateFeeAllocation(totalFeesCollected);
  const amountUsd = allocation.buyback;

  // USDC has 6 decimals
  const amountUsdcAtomic = BigInt(Math.round(amountUsd * 1_000_000));

  if (amountUsdcAtomic === BigInt(0)) {
    await prisma.buybackRecord.create({
      data: { cohortId, amountUsd: 0, status: "skipped" },
    });
    return {
      amountUsd: 0,
      amountUsdcAtomic: BigInt(0),
      adxReceived: "0",
      txSignature: "",
    };
  }

  // Get Jupiter quote
  const quote = await getJupiterQuote(amountUsdcAtomic);

  if (dryRun) {
    await prisma.buybackRecord.create({
      data: {
        cohortId,
        amountUsd,
        status: "dry_run",
      },
    });
    return {
      amountUsd,
      amountUsdcAtomic,
      adxReceived: quote.outAmount,
      txSignature: "dry_run",
    };
  }

  // Execute the swap
  const keypair = loadBuybackKeypair();
  const txSignature = await executeJupiterSwap(
    quote,
    keypair.publicKey.toBase58()
  );

  // Record in database
  await prisma.buybackRecord.create({
    data: {
      cohortId,
      amountUsd,
      status: "executed",
      txSignature,
    },
  });

  return {
    amountUsd,
    amountUsdcAtomic,
    adxReceived: quote.outAmount,
    txSignature,
  };
}
