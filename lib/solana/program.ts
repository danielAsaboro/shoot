/**
 * Shoot program client — PDA derivation and instruction builders.
 *
 * Works with @solana/web3.js to build transactions that interact with the
 * on-chain Shoot program. All entry fees and payouts are in USDC (SPL token).
 */

import {
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  SYSVAR_RENT_PUBKEY,
} from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { Buffer } from "buffer";

export const SHOOT_PROGRAM_ID = new PublicKey(
  "4HVnwG8iz7wdUbEQDH8cYGD6EuxNmMuEbvCrz8Ke2iMG"
);

// USDC mint addresses
export const USDC_MINT_MAINNET = new PublicKey(
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
);
export const USDC_MINT_DEVNET = new PublicKey(
  "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"
);

// ── PDA Derivation ──────────────────────────────────────────────────────────

export function findChallengePda(
  admin: PublicKey,
  challengeId: string
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("challenge"), admin.toBuffer(), Buffer.from(challengeId)],
    SHOOT_PROGRAM_ID
  );
}

export function findVaultPda(challenge: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), challenge.toBuffer()],
    SHOOT_PROGRAM_ID
  );
}

export function findEnrollmentPda(
  challenge: PublicKey,
  trader: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("enrollment"), challenge.toBuffer(), trader.toBuffer()],
    SHOOT_PROGRAM_ID
  );
}

export function findFundedPda(trader: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("funded"), trader.toBuffer()],
    SHOOT_PROGRAM_ID
  );
}

// ── Instruction Discriminators ──────────────────────────────────────────────

async function instructionDiscriminator(name: string): Promise<Buffer> {
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`global:${name}`)
  );
  return Buffer.from(new Uint8Array(hash).slice(0, 8));
}

// ── Instruction Builders ────────────────────────────────────────────────────

/**
 * Build an `enroll` instruction.
 * The trader's USDC token account is debited the entry fee.
 */
export async function buildEnrollInstruction(params: {
  trader: PublicKey;
  challenge: PublicKey;
  vault: PublicKey;
  traderUsdc: PublicKey;
  startingEquityUsd: number;
}): Promise<TransactionInstruction> {
  const { trader, challenge, vault, traderUsdc, startingEquityUsd } = params;
  const [enrollment] = findEnrollmentPda(challenge, trader);

  const discriminator = await instructionDiscriminator("enroll");
  const data = Buffer.alloc(8 + 8);
  discriminator.copy(data, 0);
  data.writeBigUInt64LE(BigInt(Math.round(startingEquityUsd * 100)), 8);

  return new TransactionInstruction({
    programId: SHOOT_PROGRAM_ID,
    keys: [
      { pubkey: trader, isSigner: true, isWritable: true },
      { pubkey: challenge, isSigner: false, isWritable: true },
      { pubkey: enrollment, isSigner: false, isWritable: true },
      { pubkey: traderUsdc, isSigner: false, isWritable: true },
      { pubkey: vault, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });
}

/**
 * Build a `submit_result` instruction.
 * Called by the result_authority to record off-chain scoring outcome.
 */
export async function buildSubmitResultInstruction(params: {
  authority: PublicKey;
  challenge: PublicKey;
  enrollment: PublicKey;
  status: number; // 0=Active, 1=Passed, 2=FailedDrawdown, 3=FailedDailyLimit, 4=FailedTimeout
  finalPnlBps: number;
  finalDrawdownBps: number;
}): Promise<TransactionInstruction> {
  const { authority, challenge, enrollment, status, finalPnlBps, finalDrawdownBps } = params;

  const discriminator = await instructionDiscriminator("submit_result");
  // Serialize: u8 (1) + i32 (4) + u16 (2) = 7 bytes
  const data = Buffer.alloc(8 + 7);
  discriminator.copy(data, 0);
  data.writeUInt8(status, 8);
  data.writeInt32LE(finalPnlBps, 9);
  data.writeUInt16LE(finalDrawdownBps, 13);

  return new TransactionInstruction({
    programId: SHOOT_PROGRAM_ID,
    keys: [
      { pubkey: authority, isSigner: true, isWritable: false },
      { pubkey: challenge, isSigner: false, isWritable: false },
      { pubkey: enrollment, isSigner: false, isWritable: true },
    ],
    data,
  });
}

/**
 * Build a `settle_challenge` instruction.
 * Transfers USDC payout from vault to trader. Enrollment must have Passed status.
 */
export async function buildSettleChallengeInstruction(params: {
  authority: PublicKey;
  challenge: PublicKey;
  trader: PublicKey;
  traderUsdc: PublicKey;
  vault: PublicKey;
  payoutUsdc: bigint;
}): Promise<TransactionInstruction> {
  const { authority, challenge, trader, traderUsdc, vault, payoutUsdc } = params;
  const [enrollment] = findEnrollmentPda(challenge, trader);

  const discriminator = await instructionDiscriminator("settle_challenge");
  const data = Buffer.alloc(8 + 8);
  discriminator.copy(data, 0);
  data.writeBigUInt64LE(payoutUsdc, 8);

  return new TransactionInstruction({
    programId: SHOOT_PROGRAM_ID,
    keys: [
      { pubkey: authority, isSigner: true, isWritable: false },
      { pubkey: challenge, isSigner: false, isWritable: false },
      { pubkey: enrollment, isSigner: false, isWritable: true },
      { pubkey: trader, isSigner: false, isWritable: true },
      { pubkey: traderUsdc, isSigner: false, isWritable: true },
      { pubkey: vault, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });
}

/**
 * Build a `claim_funded_status` instruction.
 * Called by the trader after passing an Elite or Apex challenge.
 */
export async function buildClaimFundedStatusInstruction(params: {
  trader: PublicKey;
  level: number; // 0=Watchlist, 1=Funded, 2=SeniorFunded, 3=Captain, 4=Partner
  revenueShareBps: number;
}): Promise<TransactionInstruction> {
  const { trader, level, revenueShareBps } = params;
  const [fundedTrader] = findFundedPda(trader);

  const discriminator = await instructionDiscriminator("claim_funded_status");
  const data = Buffer.alloc(8 + 3);
  discriminator.copy(data, 0);
  data.writeUInt8(level, 8);
  data.writeUInt16LE(revenueShareBps, 9);

  return new TransactionInstruction({
    programId: SHOOT_PROGRAM_ID,
    keys: [
      { pubkey: trader, isSigner: true, isWritable: true },
      { pubkey: fundedTrader, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });
}
