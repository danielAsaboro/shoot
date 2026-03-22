import { LiteSVM, FailedTransactionMetadata } from "litesvm";
import {
  PublicKey,
  Keypair,
  Transaction,
  TransactionInstruction,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
} from "@solana/web3.js";
import * as path from "path";
import * as crypto from "crypto";

// ── Program ID ──────────────────────────────────────────────────────────────

export const PROGRAM_ID = new PublicKey(
  "4HVnwG8iz7wdUbEQDH8cYGD6EuxNmMuEbvCrz8Ke2iMG"
);

export const TOKEN_PROGRAM_ID = new PublicKey(
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
);

// ── Instruction Discriminators ──────────────────────────────────────────────

function disc(name: string): Buffer {
  return Buffer.from(
    crypto
      .createHash("sha256")
      .update("global:" + name)
      .digest()
      .subarray(0, 8)
  );
}

const IX_DISC = {
  initializeChallenge: disc("initialize_challenge"),
  enroll: disc("enroll"),
  submitResult: disc("submit_result"),
  settleChallenge: disc("settle_challenge"),
  claimFundedStatus: disc("claim_funded_status"),
  updateChallengeStatus: disc("update_challenge_status"),
};

// ── PDA Helpers ─────────────────────────────────────────────────────────────

export function findChallengePda(
  admin: PublicKey,
  challengeId: string
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("challenge"),
      admin.toBuffer(),
      Buffer.from(challengeId),
    ],
    PROGRAM_ID
  );
}

export function findVaultPda(challengePda: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), challengePda.toBuffer()],
    PROGRAM_ID
  );
}

export function findEnrollmentPda(
  challengePda: PublicKey,
  trader: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("enrollment"),
      challengePda.toBuffer(),
      trader.toBuffer(),
    ],
    PROGRAM_ID
  );
}

export function findFundedPda(trader: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("funded"), trader.toBuffer()],
    PROGRAM_ID
  );
}

// ── Borsh Serialization Helpers ─────────────────────────────────────────────

function encodeString(s: string): Buffer {
  const strBuf = Buffer.from(s, "utf-8");
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32LE(strBuf.length);
  return Buffer.concat([lenBuf, strBuf]);
}

function encodeU64(n: number | bigint): Buffer {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(BigInt(n));
  return buf;
}

function encodeI64(n: number | bigint): Buffer {
  const buf = Buffer.alloc(8);
  buf.writeBigInt64LE(BigInt(n));
  return buf;
}

function encodeU16(n: number): Buffer {
  const buf = Buffer.alloc(2);
  buf.writeUInt16LE(n);
  return buf;
}

function encodeI32(n: number): Buffer {
  const buf = Buffer.alloc(4);
  buf.writeInt32LE(n);
  return buf;
}

function encodeU8(n: number): Buffer {
  return Buffer.from([n]);
}

// ── Instruction Builders ────────────────────────────────────────────────────

export interface InitChallengeParams {
  challengeId: string;
  tierName: string;
  entryFeeUsdc: number | bigint;
  profitTargetBps: number;
  maxDrawdownBps: number;
  dailyLossLimitBps: number;
  durationSeconds: number | bigint;
  minCapitalUsd: number | bigint;
  participantCap: number;
}

export function buildInitializeChallengeIx(
  admin: PublicKey,
  resultAuthority: PublicKey,
  usdcMint: PublicKey,
  params: InitChallengeParams
): TransactionInstruction {
  const [challengePda] = findChallengePda(admin, params.challengeId);
  const [vaultPda] = findVaultPda(challengePda);

  const data = Buffer.concat([
    IX_DISC.initializeChallenge,
    encodeString(params.challengeId),
    encodeString(params.tierName),
    encodeU64(params.entryFeeUsdc),
    encodeU16(params.profitTargetBps),
    encodeU16(params.maxDrawdownBps),
    encodeU16(params.dailyLossLimitBps),
    encodeI64(params.durationSeconds),
    encodeU64(params.minCapitalUsd),
    encodeU16(params.participantCap),
  ]);

  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: admin, isSigner: true, isWritable: true },
      { pubkey: resultAuthority, isSigner: false, isWritable: false },
      { pubkey: challengePda, isSigner: false, isWritable: true },
      { pubkey: usdcMint, isSigner: false, isWritable: false },
      { pubkey: vaultPda, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
    ],
    data,
  });
}

export function buildEnrollIx(
  trader: PublicKey,
  challengePda: PublicKey,
  traderUsdc: PublicKey,
  vault: PublicKey,
  startingEquityUsd: number | bigint
): TransactionInstruction {
  const [enrollmentPda] = findEnrollmentPda(challengePda, trader);

  const data = Buffer.concat([IX_DISC.enroll, encodeU64(startingEquityUsd)]);

  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: trader, isSigner: true, isWritable: true },
      { pubkey: challengePda, isSigner: false, isWritable: true },
      { pubkey: enrollmentPda, isSigner: false, isWritable: true },
      { pubkey: traderUsdc, isSigner: false, isWritable: true },
      { pubkey: vault, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });
}

export enum EnrollmentStatus {
  Active = 0,
  Passed = 1,
  FailedDrawdown = 2,
  FailedDailyLimit = 3,
  FailedTimeout = 4,
}

export function buildSubmitResultIx(
  authority: PublicKey,
  challengePda: PublicKey,
  enrollmentPda: PublicKey,
  status: EnrollmentStatus,
  finalPnlBps: number,
  finalDrawdownBps: number
): TransactionInstruction {
  const data = Buffer.concat([
    IX_DISC.submitResult,
    encodeU8(status),
    encodeI32(finalPnlBps),
    encodeU16(finalDrawdownBps),
  ]);

  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: authority, isSigner: true, isWritable: false },
      { pubkey: challengePda, isSigner: false, isWritable: false },
      { pubkey: enrollmentPda, isSigner: false, isWritable: true },
    ],
    data,
  });
}

export function buildSettleChallengeIx(
  authority: PublicKey,
  challengePda: PublicKey,
  trader: PublicKey,
  traderUsdc: PublicKey,
  vault: PublicKey,
  payoutUsdc: number | bigint
): TransactionInstruction {
  const [enrollmentPda] = findEnrollmentPda(challengePda, trader);

  const data = Buffer.concat([
    IX_DISC.settleChallenge,
    encodeU64(payoutUsdc),
  ]);

  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: authority, isSigner: true, isWritable: false },
      { pubkey: challengePda, isSigner: false, isWritable: false },
      { pubkey: enrollmentPda, isSigner: false, isWritable: true },
      { pubkey: trader, isSigner: false, isWritable: true },
      { pubkey: traderUsdc, isSigner: false, isWritable: true },
      { pubkey: vault, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });
}

export enum FundedLevel {
  Watchlist = 0,
  Funded = 1,
  SeniorFunded = 2,
  Captain = 3,
  Partner = 4,
}

export function buildClaimFundedStatusIx(
  trader: PublicKey,
  level: FundedLevel,
  revenueShareBps: number
): TransactionInstruction {
  const [fundedPda] = findFundedPda(trader);

  const data = Buffer.concat([
    IX_DISC.claimFundedStatus,
    encodeU8(level),
    encodeU16(revenueShareBps),
  ]);

  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: trader, isSigner: true, isWritable: true },
      { pubkey: fundedPda, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });
}

// ── Account Decoders ────────────────────────────────────────────────────────

export interface ChallengeAccount {
  admin: PublicKey;
  resultAuthority: PublicKey;
  challengeId: string;
  tierName: string;
  entryFeeUsdc: bigint;
  profitTargetBps: number;
  maxDrawdownBps: number;
  dailyLossLimitBps: number;
  durationSeconds: bigint;
  minCapitalUsd: bigint;
  participantCap: number;
  enrolledCount: number;
  status: number; // 0=Active, 1=Settling, 2=Closed
  createdAt: bigint;
  vault: PublicKey;
  usdcMint: PublicKey;
  bump: number;
  vaultBump: number;
}

export function decodeChallenge(data: Buffer): ChallengeAccount {
  let offset = 8; // skip discriminator
  const admin = new PublicKey(data.subarray(offset, offset + 32));
  offset += 32;
  const resultAuthority = new PublicKey(data.subarray(offset, offset + 32));
  offset += 32;

  let challengeId: string;
  const cidLen = data.readUInt32LE(offset);
  challengeId = data.subarray(offset + 4, offset + 4 + cidLen).toString("utf-8");
  offset += 4 + cidLen;

  let tierName: string;
  const tnLen = data.readUInt32LE(offset);
  tierName = data.subarray(offset + 4, offset + 4 + tnLen).toString("utf-8");
  offset += 4 + tnLen;

  const entryFeeUsdc = data.readBigUInt64LE(offset); offset += 8;
  const profitTargetBps = data.readUInt16LE(offset); offset += 2;
  const maxDrawdownBps = data.readUInt16LE(offset); offset += 2;
  const dailyLossLimitBps = data.readUInt16LE(offset); offset += 2;
  const durationSeconds = data.readBigInt64LE(offset); offset += 8;
  const minCapitalUsd = data.readBigUInt64LE(offset); offset += 8;
  const participantCap = data.readUInt16LE(offset); offset += 2;
  const enrolledCount = data.readUInt16LE(offset); offset += 2;
  const status = data.readUInt8(offset); offset += 1;
  const createdAt = data.readBigInt64LE(offset); offset += 8;
  const vault = new PublicKey(data.subarray(offset, offset + 32)); offset += 32;
  const usdcMint = new PublicKey(data.subarray(offset, offset + 32)); offset += 32;
  const bump = data.readUInt8(offset); offset += 1;
  const vaultBump = data.readUInt8(offset);

  return {
    admin, resultAuthority, challengeId, tierName, entryFeeUsdc,
    profitTargetBps, maxDrawdownBps, dailyLossLimitBps, durationSeconds,
    minCapitalUsd, participantCap, enrolledCount, status, createdAt,
    vault, usdcMint, bump, vaultBump,
  };
}

export interface EnrollmentAccount {
  trader: PublicKey;
  challenge: PublicKey;
  startingEquityUsd: bigint;
  enrolledAt: bigint;
  settled: boolean;
  status: EnrollmentStatus;
  finalPnlBps: number;
  finalDrawdownBps: number;
  payoutUsdc: bigint;
  resultSubmittedAt: bigint;
  bump: number;
}

export function decodeEnrollment(data: Buffer): EnrollmentAccount {
  let offset = 8;
  const trader = new PublicKey(data.subarray(offset, offset + 32)); offset += 32;
  const challenge = new PublicKey(data.subarray(offset, offset + 32)); offset += 32;
  const startingEquityUsd = data.readBigUInt64LE(offset); offset += 8;
  const enrolledAt = data.readBigInt64LE(offset); offset += 8;
  const settled = data.readUInt8(offset) === 1; offset += 1;
  const status = data.readUInt8(offset) as EnrollmentStatus; offset += 1;
  const finalPnlBps = data.readInt32LE(offset); offset += 4;
  const finalDrawdownBps = data.readUInt16LE(offset); offset += 2;
  const payoutUsdc = data.readBigUInt64LE(offset); offset += 8;
  const resultSubmittedAt = data.readBigInt64LE(offset); offset += 8;
  const bump = data.readUInt8(offset);

  return {
    trader, challenge, startingEquityUsd, enrolledAt, settled,
    status, finalPnlBps, finalDrawdownBps, payoutUsdc, resultSubmittedAt, bump,
  };
}

export interface FundedTraderAccount {
  trader: PublicKey;
  level: number;
  revenueShareBps: number;
  promotedAt: bigint;
  consecutiveWeeks: number;
  totalChallengesPassed: number;
  bump: number;
}

export function decodeFundedTrader(data: Buffer): FundedTraderAccount {
  let offset = 8;
  const trader = new PublicKey(data.subarray(offset, offset + 32)); offset += 32;
  const level = data.readUInt8(offset); offset += 1;
  const revenueShareBps = data.readUInt16LE(offset); offset += 2;
  const promotedAt = data.readBigInt64LE(offset); offset += 8;
  const consecutiveWeeks = data.readUInt16LE(offset); offset += 2;
  const totalChallengesPassed = data.readUInt16LE(offset); offset += 2;
  const bump = data.readUInt8(offset);

  return { trader, level, revenueShareBps, promotedAt, consecutiveWeeks, totalChallengesPassed, bump };
}

// ── SVM Helpers ─────────────────────────────────────────────────────────────

export function createTestSVM(): LiteSVM {
  const svm = new LiteSVM();
  const soPath = path.resolve(__dirname, "../../target/deploy/shoot.so");
  svm.addProgramFromFile(PROGRAM_ID, soPath);
  return svm;
}

export function fetchAccount(
  svm: LiteSVM,
  address: PublicKey
): Buffer | null {
  const acct = svm.getAccount(address);
  if (!acct) return null;
  return Buffer.from(acct.data);
}

export function fetchChallenge(
  svm: LiteSVM,
  address: PublicKey
): ChallengeAccount {
  const data = fetchAccount(svm, address);
  if (!data) throw new Error(`Challenge account not found: ${address}`);
  return decodeChallenge(data);
}

export function fetchEnrollment(
  svm: LiteSVM,
  address: PublicKey
): EnrollmentAccount {
  const data = fetchAccount(svm, address);
  if (!data) throw new Error(`Enrollment account not found: ${address}`);
  return decodeEnrollment(data);
}

export function fetchFundedTrader(
  svm: LiteSVM,
  address: PublicKey
): FundedTraderAccount {
  const data = fetchAccount(svm, address);
  if (!data) throw new Error(`FundedTrader account not found: ${address}`);
  return decodeFundedTrader(data);
}

export function sendTx(
  svm: LiteSVM,
  ix: TransactionInstruction | TransactionInstruction[],
  signers: Keypair[],
  payer?: Keypair
): void {
  const tx = new Transaction();
  const ixArray = Array.isArray(ix) ? ix : [ix];
  tx.add(...ixArray);

  const payerKey = payer ?? signers[0];
  tx.feePayer = payerKey.publicKey;
  tx.recentBlockhash = svm.latestBlockhash();

  tx.sign(...signers);

  const result = svm.sendTransaction(tx);
  if (result instanceof FailedTransactionMetadata) {
    throw new Error(
      `Transaction failed: ${result.toString()}`
    );
  }
}

/**
 * Anchor error codes for the Shoot program (6000 + enum index).
 */
export const SHOOT_ERRORS = {
  ChallengeNotOpen: 6000,
  ChallengeFull: 6001,
  AlreadySettled: 6002,
  Unauthorized: 6003,
  InsufficientCapital: 6004,
  InvalidPayout: 6005,
  WrongMint: 6006,
  WrongOwner: 6007,
  WrongVault: 6008,
  NotPassed: 6009,
  InvalidStatus: 6010,
} as const;

export interface TxFailure {
  raw: string;
  customErrorCode: number | null;
  logs: string[];
}

export function sendTxExpectFail(
  svm: LiteSVM,
  ix: TransactionInstruction | TransactionInstruction[],
  signers: Keypair[],
  payer?: Keypair
): TxFailure {
  const tx = new Transaction();
  const ixArray = Array.isArray(ix) ? ix : [ix];
  tx.add(...ixArray);

  const payerKey = payer ?? signers[0];
  tx.feePayer = payerKey.publicKey;
  tx.recentBlockhash = svm.latestBlockhash();

  tx.sign(...signers);

  const result = svm.sendTransaction(tx);
  if (!(result instanceof FailedTransactionMetadata)) {
    throw new Error("Expected transaction to fail but it succeeded");
  }

  const raw = result.toString();
  const logs = result.meta().logs();
  let customErrorCode: number | null = null;

  const err = result.err();
  if ("index" in err && typeof (err as any).err === "function") {
    const inner = (err as any).err();
    if ("code" in inner && typeof inner.code === "number") {
      customErrorCode = inner.code;
    }
  }

  return { raw, customErrorCode, logs };
}
