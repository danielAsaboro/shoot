/**
 * Raffle Draw + ADX Buyback
 *
 * Draws a weighted random winner from raffle entries for a settled cohort,
 * and executes the ADX buyback via Jupiter V6 swap.
 */

import { prisma } from "../db/client.ts";
import { calculateFeeAllocation } from "./engine.ts";
import { executeBuyback, type BuybackResult } from "./buyback.ts";
import crypto from "node:crypto";

/**
 * Draw a raffle winner for a settled cohort using cryptographic randomness.
 * Tickets are weighted — more tickets = higher chance of winning.
 *
 * @returns The winner wallet and prize amount, or null if no entries exist.
 */
export async function drawRaffle(
  cohortId: string,
  totalFeesCollected: number
): Promise<{ winnerWallet: string; prizeUsd: number } | null> {
  const entries = await prisma.raffleEntry.findMany({
    where: { cohortId },
  });

  if (entries.length === 0) return null;

  // Build weighted array
  const ticketPool: string[] = [];
  for (const entry of entries) {
    for (let i = 0; i < entry.tickets; i++) {
      ticketPool.push(entry.wallet);
    }
  }

  if (ticketPool.length === 0) return null;

  // Cryptographic random selection
  const randomBytes = crypto.getRandomValues(new Uint32Array(1));
  const winnerIndex = randomBytes[0] % ticketPool.length;
  const winnerWallet = ticketPool[winnerIndex];

  const allocation = calculateFeeAllocation(totalFeesCollected);
  const prizeUsd = allocation.raffle;

  // Persist the draw result
  await prisma.raffleDraw.create({
    data: { cohortId, winnerWallet, prizeUsd },
  });

  return { winnerWallet, prizeUsd };
}

/**
 * Execute the ADX buyback for a settled cohort.
 * Swaps 25% of collected entry fees from USDC to ADX via Jupiter V6.
 *
 * Requires BUYBACK_WALLET_KEYPAIR env var to be set.
 * Falls back to recording a "pending" record if the keypair is not configured.
 */
export async function recordBuyback(
  cohortId: string,
  totalFeesCollected: number
): Promise<{ amountUsd: number; txSignature?: string }> {
  // If no buyback keypair is configured, record intent and skip execution.
  // This allows the system to run in environments where the buyback wallet
  // is not available (e.g. local dev, preview deploys).
  if (!process.env.BUYBACK_WALLET_KEYPAIR) {
    const allocation = calculateFeeAllocation(totalFeesCollected);
    await prisma.buybackRecord.create({
      data: {
        cohortId,
        amountUsd: allocation.buyback,
        status: "pending",
      },
    });
    console.warn(
      `[buyback] BUYBACK_WALLET_KEYPAIR not set — recorded $${allocation.buyback} buyback as pending for cohort ${cohortId}`
    );
    return { amountUsd: allocation.buyback };
  }

  const result: BuybackResult = await executeBuyback(
    cohortId,
    totalFeesCollected
  );

  return {
    amountUsd: result.amountUsd,
    txSignature: result.txSignature,
  };
}
