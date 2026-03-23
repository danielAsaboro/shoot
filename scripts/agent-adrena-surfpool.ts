#!/usr/bin/env npx tsx
/**
 * Reasoning Agent — Real Adrena Trades via Surfpool (Mainnet Fork)
 *
 * An AI agent (GPT-4o) that:
 *   1. Calls the REAL Adrena Data API to get pool stats, positions, liquidity
 *   2. Reasons about which market to trade (SOL, BTC, ETH, BONK, XAU, etc.)
 *   3. Builds Adrena trade transactions locally via Anchor (full 28-account layout)
 *   4. Signs locally and submits to Surfpool (running as mainnet fork)
 *   5. Real Adrena perp instructions execute on local forked state
 *   6. Registers on Shoot program, enrolls in challenge, submits results
 *
 * Usage:
 *   # Terminal 1: start Surfpool with mainnet fork
 *   cd programs/shoot && surfpool start --no-tui --yes --rpc-url https://api.mainnet-beta.solana.com
 *
 *   # Terminal 2: run the reasoning agent
 *   npx tsx scripts/agent-adrena-surfpool.ts
 */

import "dotenv/config";
import OpenAI from "openai";
import {
  Connection,
  Keypair,
  PublicKey,
  VersionedTransaction,
  Transaction,
  TransactionInstruction,
  SystemProgram,
  sendAndConfirmTransaction,
  SYSVAR_RENT_PUBKEY,
} from "@solana/web3.js";
import * as crypto from "crypto";
import {
  fetchPositions,
  fetchPoolStats,
  fetchLiquidityInfo,
  fetchOpenLong,
  fetchOpenShort,
  fetchCloseLong,
  fetchCloseShort,
  fetchOpenLimitLong,
  fetchOpenLimitShort,
} from "../lib/adrena/client.ts";
import { SHOOT_PROGRAM_ID } from "../sdk/dist/index.js";

// ── Config ──────────────────────────────────────────────────────────────────

const SURFPOOL_URL = process.env.SURFPOOL_URL ?? "http://localhost:8899";
const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
const USDC_MINT_MAINNET = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
const MAX_TURNS = 30;

const EXPLORER_BASE = "https://explorer.solana.com/tx";
const EXPLORER_SUFFIX = "?cluster=custom&customUrl=http%3A%2F%2Flocalhost%3A8899";

function explorerLink(sig: string): string {
  return `${EXPLORER_BASE}/${sig}${EXPLORER_SUFFIX}`;
}

// ── Adrena Protocol Constants ────────────────────────────────────────────────

const ADRENA_PROGRAM_ID = new PublicKey("13gDzEXCdocbj8iAiqrScGo47NiSuYENGsRqi3SEAwet");
const ADRENA_MAIN_POOL = new PublicKey("4bQRutgDJs6vuh6ZcWaPVXiQaBzbHketjbCDjL4oRN34");
const ADRENA_ORACLE_DISC = crypto.createHash("sha256").update("account:Oracle").digest().subarray(0, 8);
const SYSVAR_CLOCK = new PublicKey("SysvarC1ock11111111111111111111111111111111");

function findAdrenaCustodyTokenAccountPda(mint: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([Buffer.from("custody_token_account"), ADRENA_MAIN_POOL.toBuffer(), mint.toBuffer()], ADRENA_PROGRAM_ID)[0];
}

function findAdrenaUserProfilePda(owner: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([Buffer.from("user_profile"), owner.toBuffer()], ADRENA_PROGRAM_ID)[0];
}

// ── Adrena custody data (filled by initAdrena) ───────────────────────────────

interface CustodyInfo {
  mint: PublicKey;
  custodyPda: PublicKey;
  tokenAccountPda: PublicKey;
  decimals: number;
}

const custodyByMint = new Map<string, CustodyInfo>();
const custodyBySymbol = new Map<string, CustodyInfo>();

// ── Borsh / PDA helpers ──────────────────────────────────────────────────────

function disc(name: string): Buffer {
  return Buffer.from(
    crypto.createHash("sha256").update("global:" + name).digest().subarray(0, 8)
  );
}

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

function findChallengePda(admin: PublicKey, challengeId: string): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("challenge"), admin.toBuffer(), Buffer.from(challengeId)],
    SHOOT_PROGRAM_ID
  );
}

function findVaultPda(challengePda: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), challengePda.toBuffer()],
    SHOOT_PROGRAM_ID
  );
}

function findEnrollmentPda(challengePda: PublicKey, trader: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("enrollment"), challengePda.toBuffer(), trader.toBuffer()],
    SHOOT_PROGRAM_ID
  );
}

function findAgentPda(owner: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("agent"), owner.toBuffer(), owner.toBuffer().subarray(0, 8)],
    SHOOT_PROGRAM_ID
  );
}

function findAta(owner: PublicKey, mint: PublicKey): PublicKey {
  const [ata] = PublicKey.findProgramAddressSync(
    [owner.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
  return ata;
}

// ── Surfnet RPC ─────────────────────────────────────────────────────────────

let rpcId = 0;
async function surfnetRpc(method: string, params?: unknown[]): Promise<unknown> {
  const body: Record<string, unknown> = { jsonrpc: "2.0", id: ++rpcId, method };
  if (params) body.params = params;
  const res = await fetch(SURFPOOL_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as { result?: unknown; error?: { message: string } };
  if (json.error) throw new Error(`RPC ${method}: ${json.error.message}`);
  return json.result;
}

async function setAccount(
  pubkey: PublicKey,
  opts: { lamports?: number; data?: Buffer; owner?: PublicKey }
): Promise<void> {
  const params: Record<string, unknown> = {};
  if (opts.lamports !== undefined) params.lamports = opts.lamports;
  if (opts.data !== undefined) params.data = opts.data.toString("hex");
  if (opts.owner !== undefined) params.owner = opts.owner.toBase58();
  await surfnetRpc("surfnet_setAccount", [pubkey.toBase58(), params]);
}

async function createRawTokenAccount(
  address: PublicKey, mint: PublicKey, owner: PublicKey, amount: bigint
): Promise<void> {
  const data = Buffer.alloc(165);
  mint.toBuffer().copy(data, 0);
  owner.toBuffer().copy(data, 32);
  data.writeBigUInt64LE(amount, 64);
  data.writeUInt8(1, 108);
  await setAccount(address, { lamports: 2_039_280, data, owner: TOKEN_PROGRAM_ID });
}

// ── Adrena initializer ───────────────────────────────────────────────────────

/**
 * Initialize the Anchor program client and read all custody metadata from on-chain state.
 * Must be called after the wallet is funded and Surfpool is running.
 */
async function initAdrena(_wallet: Keypair, conn: Connection): Promise<void> {
  // Read pool to get custody addresses
  // Pool layout: disc(8) + 8 flag bytes + name(LimitedString=32) = custodies start at offset 48
  // custodies: [publicKey; 10] — 10 slots of 32 bytes each
  const poolInfo = await conn.getAccountInfo(ADRENA_MAIN_POOL);
  if (!poolInfo) throw new Error("Adrena main pool not found on Surfpool");

  const custodyAddresses: PublicKey[] = [];
  for (let i = 0; i < 10; i++) {
    const start = 48 + i * 32;
    const key = new PublicKey(poolInfo.data.slice(start, start + 32));
    if (!key.equals(PublicKey.default)) custodyAddresses.push(key);
  }

  // Read all custody accounts in one call
  // Custody layout after disc(8): bump(1) tokenAccountBump(1) allowTrade(1) allowSwap(1)
  //   decimals(1) isStable(1) padding(2) pool(32)@16 mint(32)@48
  const custodyAccounts = await conn.getMultipleAccountsInfo(custodyAddresses);
  for (let i = 0; i < custodyAddresses.length; i++) {
    const info = custodyAccounts[i];
    if (!info) continue;
    const d = Buffer.from(info.data);
    const decimals = d[12];
    const mint = new PublicKey(d.slice(48, 80));
    const custodyInfo: CustodyInfo = {
      mint,
      custodyPda: custodyAddresses[i],
      tokenAccountPda: findAdrenaCustodyTokenAccountPda(mint),
      decimals,
    };
    custodyByMint.set(mint.toBase58(), custodyInfo);
  }

  // Build symbol → custody map via the data API
  try {
    const liquidity = await fetchLiquidityInfo();
    for (const c of liquidity.custodies) {
      const info = custodyByMint.get(c.mint);
      if (!info) continue;
      const sym = c.symbol.toUpperCase();
      custodyBySymbol.set(sym, info);
      if (sym === "WBTC") custodyBySymbol.set("BTC", info);
      if (sym === "WSOL") custodyBySymbol.set("SOL", info);
    }
  } catch (e) {
    console.warn("  Warning: could not fetch liquidity info for symbol map:", (e as Error).message);
  }

  // Ensure USDC is in the map
  const usdcInfo = custodyByMint.get(USDC_MINT_MAINNET.toBase58());
  if (usdcInfo) custodyBySymbol.set("USDC", usdcInfo);

  console.log(`✓ Adrena: ${custodyAddresses.length} custodies, symbols: ${[...custodyBySymbol.keys()].join(", ")}`);
}

// ── Adrena trade helpers ─────────────────────────────────────────────────────

function getCustody(symbol: string): CustodyInfo {
  const info = custodyBySymbol.get(symbol.toUpperCase());
  if (!info) throw new Error(`No Adrena custody found for symbol: ${symbol}. Available: ${[...custodyBySymbol.keys()].join(", ")}`);
  return info;
}

/**
 * Pre-create a valid Adrena UserProfile account on Surfpool via surfnet_setAccount.
 * The live program checks that user_profile.owner == ADRENA_PROGRAM_ID before executing.
 * We inject a minimal but structurally-valid UserProfile so that check passes.
 *
 * UserProfile layout (408 bytes):
 *   disc(8) + bump(1) + version(1) + profilePicture(1) + wallpaper(1) + title(1)
 *   + team(1) + continent(1) + padding(1) + nickname(LimitedString=32) + createdAt(i64=8)
 *   + owner(pubkey=32) + achievements([u8;256]) + referrerProfile(pubkey=32)
 *   + claimableReferralFeeUsd(u64=8) + totalReferralFeeUsd(u64=8) + padding2([u8;16])
 */
async function ensureAdrenaUserProfile(wallet: Keypair): Promise<void> {
  const userProfilePda = findAdrenaUserProfilePda(wallet.publicKey);
  const existing = await connection.getAccountInfo(userProfilePda);
  if (existing) return; // already exists

  const [, bump] = PublicKey.findProgramAddressSync(
    [Buffer.from("user_profile"), wallet.publicKey.toBuffer()],
    ADRENA_PROGRAM_ID
  );

  const data = Buffer.alloc(408, 0);
  // Anchor discriminator: sha256("account:UserProfile")[:8]
  const discBuf = crypto.createHash("sha256").update("account:UserProfile").digest().subarray(0, 8);
  discBuf.copy(data, 0);
  data.writeUInt8(bump, 8);   // bump
  // version/profilePicture/wallpaper/title/team/continent/padding = 0
  // nickname = all zeros (length byte at offset 8+8+31 = 47 is 0)
  // createdAt (i64) at offset 48 = 0
  // owner (pubkey) at offset 56
  wallet.publicKey.toBuffer().copy(data, 56);
  // achievements at offset 88 = all zeros
  // referrerProfile at offset 344 = all zeros (PublicKey.default = no referrer)
  // claimable/totalReferralFeeUsd at 376/384 = 0
  // padding2 at 392 = all zeros

  const lamports = 2_039_280 + 408 * 6960; // rough rent-exempt estimate
  await setAccount(userProfilePda, { lamports, data, owner: ADRENA_PROGRAM_ID });
  console.log(`✓ Adrena UserProfile initialized (${userProfilePda.toBase58().slice(0, 16)}...)`);
}

/**
 * The Data API may omit trailing optional accounts when they do not exist on mainnet.
 * On Surfpool we pre-create userProfile locally, so we rebuild the prepared instructions
 * and append both userProfile and the null referrerProfile sentinel when absent.
 */
async function submitAdrenaDataApiTx(base64Tx: string, signer: Keypair): Promise<string> {
  const vtx = VersionedTransaction.deserialize(Buffer.from(base64Tx, "base64"));
  if (vtx.message.addressTableLookups.length > 0) {
    throw new Error("Market-order transaction unexpectedly uses address lookup tables");
  }

  await cloneAdrenaOraclesToSurfpool(vtx);

  const keys = vtx.message.staticAccountKeys;
  const userProfilePda = findAdrenaUserProfilePda(signer.publicKey);

  const ixs = vtx.message.compiledInstructions.map((compiledIx) => {
    const programId = keys[compiledIx.programIdIndex];
    const ixKeys = compiledIx.accountKeyIndexes.map((idx) => ({
      pubkey: keys[idx],
      isSigner: vtx.message.isAccountSigner(idx),
      isWritable: vtx.message.isAccountWritable(idx),
    }));

    if (
      programId.equals(ADRENA_PROGRAM_ID) &&
      !ixKeys.some((key) => key.pubkey.equals(userProfilePda))
    ) {
      ixKeys.push({ pubkey: userProfilePda, isSigner: false, isWritable: true });
      ixKeys.push({ pubkey: ADRENA_PROGRAM_ID, isSigner: false, isWritable: false });
    }

    return new TransactionInstruction({
      programId,
      keys: ixKeys,
      data: Buffer.from(compiledIx.data),
    });
  });

  return sendTx(ixs, [signer]);
}

// ── Transaction helpers ─────────────────────────────────────────────────────

const connection = new Connection(SURFPOOL_URL, "confirmed");

async function sendTx(ixs: TransactionInstruction[], signers: Keypair[]): Promise<string> {
  const tx = new Transaction().add(...ixs);
  // Simulate first to capture full logs
  const { blockhash } = await connection.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  tx.feePayer = signers[0].publicKey;
  const sim = await connection.simulateTransaction(tx, signers);
  if (sim.value.err) {
    const logs = (sim.value.logs ?? []).join("\n");
    throw new Error(`Simulation failed.\nLogs:\n${logs}\nErr: ${JSON.stringify(sim.value.err)}`);
  }
  return await sendAndConfirmTransaction(connection, tx, signers, {
    commitment: "confirmed",
    skipPreflight: true,
  });
}

const MAINNET_URL = "https://api.mainnet-beta.solana.com";
const mainnetConn = new Connection(MAINNET_URL, "confirmed");

async function getSurfpoolUnixTimestamp(): Promise<bigint> {
  const info = await connection.getAccountInfo(SYSVAR_CLOCK);
  if (!info) throw new Error("Clock sysvar missing on Surfpool");
  return Buffer.from(info.data).readBigInt64LE(32);
}

function patchStableOracleEntries(data: Buffer, unixTimestamp: bigint): number {
  data.writeBigInt64LE(unixTimestamp, 16);

  let patched = 0;
  for (let off = 120; off + 64 <= data.length; off += 64) {
    const nameLen = data[off + 31];
    if (nameLen === 0 || nameLen > 31) continue;
    const name = data.subarray(off, off + nameLen).toString("ascii");
    if (name !== "USDCUSD") continue;

    const price = data.readBigUInt64LE(off + 32);
    if (price !== 0n) continue;

    data.writeBigUInt64LE(10_000_000_000n, off + 32); // 1.0 with exponent -10
    data.writeBigUInt64LE(1n, off + 40);
    data.writeBigInt64LE(unixTimestamp, off + 48);
    data.writeInt32LE(-10, off + 56);
    data.writeUInt8(5, off + 60); // Chaos Labs USDC/USD feed id
    data.fill(0, off + 61, off + 64);
    patched++;
  }
  return patched;
}

async function cloneAltsToSurfpool(vtx: VersionedTransaction): Promise<void> {
  const lookups = vtx.message.addressTableLookups;
  if (!lookups || lookups.length === 0) return;
  for (const lookup of lookups) {
    const altAddress = lookup.accountKey;
    const info = await mainnetConn.getAccountInfo(altAddress);
    if (!info) continue;
    await setAccount(altAddress, {
      lamports: info.lamports,
      data: Buffer.from(info.data),
      owner: info.owner,
    });
  }
}

async function cloneAdrenaOraclesToSurfpool(vtx: VersionedTransaction): Promise<void> {
  const keys = vtx.message.staticAccountKeys;
  const oracleCandidates = new Map<string, PublicKey>();

  for (const compiledIx of vtx.message.compiledInstructions) {
    if (!keys[compiledIx.programIdIndex].equals(ADRENA_PROGRAM_ID)) continue;
    for (const idx of compiledIx.accountKeyIndexes) {
      const key = keys[idx];
      oracleCandidates.set(key.toBase58(), key);
    }
  }

  if (oracleCandidates.size === 0) return;

  const candidateKeys = [...oracleCandidates.values()];
  const infos = await mainnetConn.getMultipleAccountsInfo(candidateKeys);
  const surfpoolUnixTimestamp = await getSurfpoolUnixTimestamp();

  for (let i = 0; i < candidateKeys.length; i++) {
    const info = infos[i];
    if (
      !info ||
      !info.owner.equals(ADRENA_PROGRAM_ID) ||
      info.data.length < 8 ||
      !Buffer.from(info.data).subarray(0, 8).equals(ADRENA_ORACLE_DISC)
    ) {
      continue;
    }

    const data = Buffer.from(info.data);
    patchStableOracleEntries(data, surfpoolUnixTimestamp);

    await setAccount(candidateKeys[i], {
      lamports: info.lamports,
      data,
      owner: info.owner,
    });
  }
}

/**
 * Sign and submit a prepared Data API transaction without rewriting its accounts.
 */
async function signAndSubmitAdrena(base64Tx: string, signer: Keypair): Promise<string> {
  const txBuf = Buffer.from(base64Tx, "base64");
  const vtx = VersionedTransaction.deserialize(txBuf);
  await cloneAltsToSurfpool(vtx);
  await cloneAdrenaOraclesToSurfpool(vtx);
  const { blockhash } = await connection.getLatestBlockhash("confirmed");
  vtx.message.recentBlockhash = blockhash;
  vtx.sign([signer]);
  const sig = await connection.sendRawTransaction(vtx.serialize(), { skipPreflight: true });
  await connection.confirmTransaction(sig, "confirmed");
  const status = await connection.getSignatureStatus(sig);
  if (status.value?.err) {
    throw new Error(`Adrena instruction failed on-chain: ${JSON.stringify(status.value.err)}`);
  }
  return sig;
}

// ── Keypair loader ──────────────────────────────────────────────────────────

function loadKeypairFromEnv(): Keypair {
  const raw = process.env.AGENT_KEYPAIR;
  if (!raw) {
    console.log("  (No AGENT_KEYPAIR in .env — generating ephemeral keypair)");
    return Keypair.generate();
  }
  const bytes = JSON.parse(raw) as number[];
  return Keypair.fromSecretKey(Uint8Array.from(bytes));
}

// ── Agent state ─────────────────────────────────────────────────────────────

interface AgentState {
  wallet: Keypair;
  admin: Keypair;
  resultAuthority: Keypair;
  tradeCount: number;
  totalPnlBps: number;
  maxDrawdownBps: number;
  txLog: { instruction: string; sig: string; explorer: string }[];
}

// ── OpenAI tool definitions ─────────────────────────────────────────────────

function buildOpenAITools(): OpenAI.Chat.Completions.ChatCompletionTool[] {
  return [
    {
      type: "function",
      function: {
        name: "getPositions",
        description: "Fetch your open and historical positions from Adrena (real mainnet data via API).",
        parameters: {
          type: "object",
          properties: {
            limit: { type: "number", description: "Max positions (default 100)" },
          },
        },
      },
    },
    {
      type: "function",
      function: {
        name: "getPoolStats",
        description: "Get Adrena pool statistics: daily/total volume, fees. Real mainnet data.",
        parameters: {
          type: "object",
          properties: {
            endDate: { type: "string", description: "End date filter YYYY-MM-DD (optional)" },
          },
        },
      },
    },
    {
      type: "function",
      function: {
        name: "getLiquidityInfo",
        description: "Get per-custody liquidity breakdown: TVL, utilization, target ratios for all markets. Real mainnet data.",
        parameters: { type: "object", properties: {} },
      },
    },
    {
      type: "function",
      function: {
        name: "openLong",
        description: "Open a leveraged LONG position on Adrena. Builds Anchor tx with full account layout, submits to Surfpool.",
        parameters: {
          type: "object",
          properties: {
            collateralAmount: { type: "number", description: "Collateral in token units (e.g. 0.5 for 0.5 USDC)" },
            collateralTokenSymbol: { type: "string", description: "Collateral token: USDC" },
            tokenSymbol: { type: "string", description: "Market: JITOSOL, BTC, BONK, SOL, ETH" },
            leverage: { type: "number", description: "Leverage 1.1x to 100x (e.g. 3 for 3x)" },
          },
          required: ["collateralAmount", "collateralTokenSymbol", "tokenSymbol", "leverage"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "openShort",
        description: "Open a leveraged SHORT position on Adrena. Builds Anchor tx, submits to Surfpool.",
        parameters: {
          type: "object",
          properties: {
            collateralAmount: { type: "number", description: "Collateral in USDC" },
            collateralTokenSymbol: { type: "string", description: "Collateral token: USDC" },
            tokenSymbol: { type: "string", description: "Market to short: JITOSOL, BTC, BONK, SOL, ETH" },
            leverage: { type: "number", description: "Leverage 1.1x to 100x" },
          },
          required: ["collateralAmount", "collateralTokenSymbol", "tokenSymbol", "leverage"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "closeLong",
        description: "Close an open LONG position. Builds Anchor tx, submits to Surfpool.",
        parameters: {
          type: "object",
          properties: {
            tokenSymbol: { type: "string", description: "Market token of the position to close" },
          },
          required: ["tokenSymbol"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "closeShort",
        description: "Close an open SHORT position. Builds Anchor tx, submits to Surfpool.",
        parameters: {
          type: "object",
          properties: {
            tokenSymbol: { type: "string", description: "Market token of the short position to close" },
          },
          required: ["tokenSymbol"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "openLimitLong",
        description: "Place a limit order for a LONG position.",
        parameters: {
          type: "object",
          properties: {
            collateralAmount: { type: "number" },
            collateralTokenSymbol: { type: "string" },
            tokenSymbol: { type: "string" },
            leverage: { type: "number" },
            triggerPrice: { type: "number" },
            limitPrice: { type: "number" },
          },
          required: ["collateralAmount", "collateralTokenSymbol", "tokenSymbol", "leverage", "triggerPrice"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "openLimitShort",
        description: "Place a limit order for a SHORT position.",
        parameters: {
          type: "object",
          properties: {
            collateralAmount: { type: "number" },
            collateralTokenSymbol: { type: "string" },
            tokenSymbol: { type: "string" },
            leverage: { type: "number" },
            triggerPrice: { type: "number" },
            limitPrice: { type: "number" },
          },
          required: ["collateralAmount", "collateralTokenSymbol", "tokenSymbol", "leverage", "triggerPrice"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "registerAgent",
        description: "Register this agent on-chain via the Shoot program. Must be done before trading.",
        parameters: {
          type: "object",
          properties: {
            strategyName: { type: "string", description: "Name for your strategy" },
          },
          required: ["strategyName"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "createAndEnroll",
        description: "Create a Scout challenge and enroll in it. Pays 10 USDC entry fee on-chain.",
        parameters: { type: "object", properties: {} },
      },
    },
    {
      type: "function",
      function: {
        name: "submitResult",
        description: "Submit your trading results on-chain after you're done trading.",
        parameters: { type: "object", properties: {} },
      },
    },
  ];
}

// ── Tool execution ──────────────────────────────────────────────────────────

async function executeTool(
  name: string,
  args: Record<string, unknown>,
  state: AgentState,
  challengeId: string
): Promise<string> {
  const wallet = state.wallet;
  const walletAddr = wallet.publicKey.toBase58();

  switch (name) {
    // ── Read tools → real Adrena Data API ──
    case "getPositions": {
      const positions = await fetchPositions(walletAddr, (args.limit as number) ?? 100);
      return JSON.stringify({ positions: positions.slice(0, 20), total: positions.length });
    }
    case "getPoolStats": {
      const stats = await fetchPoolStats(args.endDate ? { end_date: args.endDate as string } : {});
      return JSON.stringify(stats);
    }
    case "getLiquidityInfo": {
      const info = await fetchLiquidityInfo();
      return JSON.stringify(info);
    }

    // ── Trade tools → Data API transaction → Surfpool ──
    // Market-order payloads may omit userProfile when it is absent on mainnet, so we
    // rehydrate the prepared instructions and inject only that optional local account.
    case "openLong": {
      const apiResult = await fetchOpenLong({
        account: walletAddr,
        collateralAmount: args.collateralAmount as number,
        collateralTokenSymbol: args.collateralTokenSymbol as string,
        tokenSymbol: args.tokenSymbol as string,
        leverage: args.leverage as number,
      });
      const sig = await submitAdrenaDataApiTx(apiResult.transaction, wallet);
      state.tradeCount++;
      state.txLog.push({ instruction: `openLong ${args.tokenSymbol} ${args.leverage}x`, sig, explorer: explorerLink(sig) });
      return JSON.stringify({ success: true, quote: apiResult.quote, signature: sig, explorer: explorerLink(sig) });
    }
    case "openShort": {
      const apiResult = await fetchOpenShort({
        account: walletAddr,
        collateralAmount: args.collateralAmount as number,
        collateralTokenSymbol: args.collateralTokenSymbol as string,
        tokenSymbol: args.tokenSymbol as string,
        leverage: args.leverage as number,
      });
      const sig = await submitAdrenaDataApiTx(apiResult.transaction, wallet);
      state.tradeCount++;
      state.txLog.push({ instruction: `openShort ${args.tokenSymbol} ${args.leverage}x`, sig, explorer: explorerLink(sig) });
      return JSON.stringify({ success: true, quote: apiResult.quote, signature: sig, explorer: explorerLink(sig) });
    }
    case "closeLong": {
      const tokenSymbol = args.tokenSymbol as string;
      const apiResult = await fetchCloseLong({
        account: walletAddr,
        collateralTokenSymbol: tokenSymbol, // long collateral = position token
        tokenSymbol,
      });
      const sig = await submitAdrenaDataApiTx(apiResult.transaction, wallet);
      state.txLog.push({ instruction: `closeLong ${tokenSymbol}`, sig, explorer: explorerLink(sig) });
      return JSON.stringify({ success: true, quote: apiResult.quote, signature: sig, explorer: explorerLink(sig) });
    }
    case "closeShort": {
      const tokenSymbol = args.tokenSymbol as string;
      const apiResult = await fetchCloseShort({
        account: walletAddr,
        collateralTokenSymbol: "USDC", // short collateral is always USDC
        tokenSymbol,
      });
      const sig = await submitAdrenaDataApiTx(apiResult.transaction, wallet);
      state.txLog.push({ instruction: `closeShort ${tokenSymbol}`, sig, explorer: explorerLink(sig) });
      return JSON.stringify({ success: true, quote: apiResult.quote, signature: sig, explorer: explorerLink(sig) });
    }
    case "openLimitLong": {
      const result = await fetchOpenLimitLong({
        account: walletAddr,
        collateralAmount: args.collateralAmount as number,
        collateralTokenSymbol: args.collateralTokenSymbol as string,
        tokenSymbol: args.tokenSymbol as string,
        leverage: args.leverage as number,
        triggerPrice: args.triggerPrice as number,
        limitPrice: args.limitPrice as number | undefined,
      });
      const sig = await signAndSubmitAdrena(result.transaction, wallet);
      state.tradeCount++;
      state.txLog.push({ instruction: `limitLong ${args.tokenSymbol} @${args.triggerPrice}`, sig, explorer: explorerLink(sig) });
      return JSON.stringify({ success: true, quote: result.quote, signature: sig, explorer: explorerLink(sig) });
    }
    case "openLimitShort": {
      const result = await fetchOpenLimitShort({
        account: walletAddr,
        collateralAmount: args.collateralAmount as number,
        collateralTokenSymbol: args.collateralTokenSymbol as string,
        tokenSymbol: args.tokenSymbol as string,
        leverage: args.leverage as number,
        triggerPrice: args.triggerPrice as number,
        limitPrice: args.limitPrice as number | undefined,
      });
      const sig = await signAndSubmitAdrena(result.transaction, wallet);
      state.tradeCount++;
      state.txLog.push({ instruction: `limitShort ${args.tokenSymbol} @${args.triggerPrice}`, sig, explorer: explorerLink(sig) });
      return JSON.stringify({ success: true, quote: result.quote, signature: sig, explorer: explorerLink(sig) });
    }

    // ── Shoot program tools (on-chain via Surfpool) ──
    case "registerAgent": {
      const strategyName = (args.strategyName as string) || "AdrenaAgent-v1";
      const strategyHash = crypto.createHash("sha256").update(strategyName).digest();
      const [agentPda] = findAgentPda(wallet.publicKey);

      const ix = new TransactionInstruction({
        programId: SHOOT_PROGRAM_ID,
        keys: [
          { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
          { pubkey: agentPda, isSigner: false, isWritable: true },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        data: Buffer.concat([disc("register_agent"), encodeString(strategyName), Buffer.from(strategyHash)]),
      });

      const sig = await sendTx([ix], [wallet]);
      state.txLog.push({ instruction: "register_agent", sig, explorer: explorerLink(sig) });
      return JSON.stringify({ success: true, agentPda: agentPda.toBase58(), signature: sig, explorer: explorerLink(sig) });
    }

    case "createAndEnroll": {
      const [challengePda] = findChallengePda(state.admin.publicKey, challengeId);
      const [vaultPda] = findVaultPda(challengePda);

      const initIx = new TransactionInstruction({
        programId: SHOOT_PROGRAM_ID,
        keys: [
          { pubkey: state.admin.publicKey, isSigner: true, isWritable: true },
          { pubkey: state.resultAuthority.publicKey, isSigner: false, isWritable: false },
          { pubkey: challengePda, isSigner: false, isWritable: true },
          { pubkey: USDC_MINT_MAINNET, isSigner: false, isWritable: false },
          { pubkey: vaultPda, isSigner: false, isWritable: true },
          { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
          { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
        ],
        data: Buffer.concat([
          disc("initialize_challenge"),
          encodeString(challengeId),
          encodeString("Scout"),
          encodeU64(10_000_000),
          encodeU16(800),
          encodeU16(500),
          encodeU16(300),
          encodeI64(7 * 24 * 60 * 60),
          encodeU64(50_000_000),
          encodeU16(128),
        ]),
      });

      const initSig = await sendTx([initIx], [state.admin]);
      state.txLog.push({ instruction: "initialize_challenge", sig: initSig, explorer: explorerLink(initSig) });

      const agentAta = findAta(wallet.publicKey, USDC_MINT_MAINNET);
      const [enrollmentPda] = findEnrollmentPda(challengePda, wallet.publicKey);
      const enrollIx = new TransactionInstruction({
        programId: SHOOT_PROGRAM_ID,
        keys: [
          { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
          { pubkey: challengePda, isSigner: false, isWritable: true },
          { pubkey: enrollmentPda, isSigner: false, isWritable: true },
          { pubkey: agentAta, isSigner: false, isWritable: true },
          { pubkey: vaultPda, isSigner: false, isWritable: true },
          { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        data: Buffer.concat([disc("enroll"), encodeU64(500_000_000)]),
      });

      const enrollSig = await sendTx([enrollIx], [wallet]);
      state.txLog.push({ instruction: "enroll", sig: enrollSig, explorer: explorerLink(enrollSig) });

      return JSON.stringify({
        success: true,
        challengeId,
        challengePda: challengePda.toBase58(),
        initExplorer: explorerLink(initSig),
        enrollExplorer: explorerLink(enrollSig),
      });
    }

    case "submitResult": {
      const [challengePda] = findChallengePda(state.admin.publicKey, challengeId);
      const [enrollmentPda] = findEnrollmentPda(challengePda, wallet.publicKey);
      const [agentPda] = findAgentPda(wallet.publicKey);

      const passed = state.totalPnlBps >= 800;
      const status = passed ? 1 : state.totalPnlBps <= -500 ? 2 : 4;

      const submitIx = new TransactionInstruction({
        programId: SHOOT_PROGRAM_ID,
        keys: [
          { pubkey: state.resultAuthority.publicKey, isSigner: true, isWritable: false },
          { pubkey: challengePda, isSigner: false, isWritable: false },
          { pubkey: enrollmentPda, isSigner: false, isWritable: true },
        ],
        data: Buffer.concat([
          disc("submit_result"),
          encodeU8(status),
          encodeI32(state.totalPnlBps),
          encodeU16(Math.abs(state.maxDrawdownBps)),
        ]),
      });

      const submitSig = await sendTx([submitIx], [state.resultAuthority]);
      state.txLog.push({ instruction: "submit_result", sig: submitSig, explorer: explorerLink(submitSig) });

      const statsData = Buffer.alloc(8 + 1 + 4 + 4 + 4);
      disc("update_agent_stats").copy(statsData, 0);
      statsData.writeUInt8(passed ? 1 : 0, 8);
      statsData.writeInt32LE(state.totalPnlBps, 9);
      statsData.writeUInt32LE(state.tradeCount, 13);
      statsData.writeUInt32LE(1200, 17);

      const statsIx = new TransactionInstruction({
        programId: SHOOT_PROGRAM_ID,
        keys: [
          { pubkey: state.resultAuthority.publicKey, isSigner: true, isWritable: false },
          { pubkey: challengePda, isSigner: false, isWritable: false },
          { pubkey: agentPda, isSigner: false, isWritable: true },
        ],
        data: statsData,
      });

      const statsSig = await sendTx([statsIx], [state.resultAuthority]);
      state.txLog.push({ instruction: "update_agent_stats", sig: statsSig, explorer: explorerLink(statsSig) });

      return JSON.stringify({
        success: true,
        passed,
        pnlBps: state.totalPnlBps,
        tradeCount: state.tradeCount,
        submitExplorer: explorerLink(submitSig),
        statsExplorer: explorerLink(statsSig),
      });
    }

    default:
      return JSON.stringify({ error: `Unknown tool: ${name}` });
  }
}

// ── System prompt ───────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are an autonomous Adrena trading agent running against a Surfpool mainnet fork.

You have access to the REAL Adrena Data API for market data, and you submit trades to a local Surfpool validator that has forked mainnet state (including the Adrena program, pools, and custody accounts).

## Available Markets
JITOSOL, BTC, BONK, SOL (and more based on liquidity data)

## Your Mission
1. Register yourself as an agent on the Shoot program
2. Create a Scout challenge and enroll (10 USDC entry, 8% profit target)
3. Check real Adrena pool stats and liquidity to pick the best market
4. Open positions using Anchor transactions (built locally with full account layout)
5. Monitor positions, close when profitable
6. Submit your results on-chain

## Important
- Trade tools build Anchor instructions locally with 28 accounts and submit to Surfpool
- The Adrena program executes on Surfpool's forked mainnet state
- Start with small positions (0.3-0.8 USDC collateral, 2-5x leverage)
- Your wallet has 100 SOL + 100 USDC on Surfpool
- Always use USDC as collateralTokenSymbol for both openLong and openShort

CRITICAL RULES:
1. You MUST open at least 3 positions across different markets (e.g. JITOSOL, BTC, BONK)
2. Use 0.3-0.8 USDC collateral per trade with 2-5x leverage
3. After opening positions, you MUST close them using closeLong or closeShort
4. After closing, you MUST call submitResult to record everything on-chain
5. Do NOT stop until you have completed ALL steps: open → close → submitResult
6. Do NOT just analyze and stop. EVERY turn should include a tool call.
7. If a tool errors, try a different market or smaller amount — do NOT give up.

REQUIRED SEQUENCE:
  Turn 1: getPoolStats + getLiquidityInfo + registerAgent
  Turn 2: createAndEnroll
  Turn 3: openLong on JITOSOL (0.5 USDC, 3x)
  Turn 4: openShort on BONK (0.3 USDC, 2x)
  Turn 5: openLong on BTC (0.4 USDC, 4x)
  Turn 6: closeLong JITOSOL
  Turn 7: closeShort BONK
  Turn 8: closeLong BTC
  Turn 9: submitResult
  Turn 10: Summarize and stop

You MUST NOT stop before calling submitResult.`;

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error("Missing OPENAI_API_KEY in .env");
    process.exit(1);
  }
  const openai = new OpenAI({ apiKey });

  console.log("╔═══════════════════════════════════════════════════════════╗");
  console.log("║  ADRENA AGENT — Real API + Surfpool (Mainnet Fork)       ║");
  console.log("╚═══════════════════════════════════════════════════════════╝");
  console.log();

  // Verify Surfpool
  try {
    await surfnetRpc("getHealth");
    console.log("✓ Surfpool running at", SURFPOOL_URL);
  } catch {
    console.error("✗ Surfpool not reachable. Start with:");
    console.error("  cd programs/shoot && surfpool start --no-tui --yes --rpc-url https://api.mainnet-beta.solana.com");
    process.exit(1);
  }

  // Verify Shoot program
  const progInfo = await connection.getAccountInfo(SHOOT_PROGRAM_ID);
  if (!progInfo?.executable) {
    console.error("✗ Shoot program not deployed at", SHOOT_PROGRAM_ID.toBase58());
    process.exit(1);
  }
  console.log("✓ Shoot program deployed:", SHOOT_PROGRAM_ID.toBase58());

  // Verify Adrena Data API
  try {
    await fetchPoolStats();
    console.log("✓ Adrena Data API reachable at datapi.adrena.trade");
  } catch (e) {
    console.error("✗ Adrena Data API unreachable:", (e as Error).message);
    process.exit(1);
  }

  // Create actors
  const state: AgentState = {
    wallet: loadKeypairFromEnv(),
    admin: Keypair.generate(),
    resultAuthority: Keypair.generate(),
    tradeCount: 0,
    totalPnlBps: 0,
    maxDrawdownBps: 0,
    txLog: [],
  };

  const challengeId = `adrena-agent-${Date.now()}`;

  console.log();
  console.log("── Actors ──────────────────────────────────────────────────");
  console.log("  Agent wallet:", state.wallet.publicKey.toBase58());
  console.log("  Admin:       ", state.admin.publicKey.toBase58());
  console.log("  Challenge ID:", challengeId);
  console.log();

  // Fund accounts on Surfpool fork
  await setAccount(state.wallet.publicKey, { lamports: 100_000_000_000 });
  await setAccount(state.admin.publicKey, { lamports: 100_000_000_000 });
  await setAccount(state.resultAuthority.publicKey, { lamports: 100_000_000_000 });
  console.log("✓ Funded all accounts (100 SOL each via surfnet_setAccount)");

  // Create USDC token account for agent (100 USDC)
  const agentAta = findAta(state.wallet.publicKey, USDC_MINT_MAINNET);
  await createRawTokenAccount(agentAta, USDC_MINT_MAINNET, state.wallet.publicKey, BigInt(100_000_000));
  console.log("✓ Agent USDC balance: 100 USDC");

  // Pre-create ATAs for all Adrena custody tokens so collateral_account is initialized
  const WSOL_MINT = new PublicKey("So11111111111111111111111111111111111111112");
  await createRawTokenAccount(findAta(state.wallet.publicKey, WSOL_MINT), WSOL_MINT, state.wallet.publicKey, BigInt(0));
  console.log("✓ ATA initialized for wSOL");

  try {
    const liquidity = await fetchLiquidityInfo();
    for (const custody of liquidity.custodies) {
      if (custody.mint === USDC_MINT_MAINNET.toBase58()) continue;
      const mint = new PublicKey(custody.mint);
      await createRawTokenAccount(findAta(state.wallet.publicKey, mint), mint, state.wallet.publicKey, BigInt(0));
      console.log(`✓ ATA initialized for ${custody.symbol} (${custody.mint.slice(0, 8)}...)`);
    }
  } catch (e) {
    console.warn("  (Could not pre-create custody ATAs:", (e as Error).message, ")");
  }
  console.log();

  // Initialize Anchor-based Adrena client and pre-create UserProfile
  await initAdrena(state.wallet, connection);
  await ensureAdrenaUserProfile(state.wallet);
  console.log();

  // Build tools
  const tools = buildOpenAITools();

  // Start conversation
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content: `You are live on Surfpool (mainnet fork). Your wallet is ${state.wallet.publicKey.toBase58()} with 100 SOL + 100 USDC.

Start the full trading lifecycle now. Follow the REQUIRED SEQUENCE exactly.

Go!`,
    },
  ];

  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  AGENT REASONING LOOP (GPT-4o + Real Adrena API)");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log();

  for (let turn = 1; turn <= MAX_TURNS; turn++) {
    console.log(`── Turn ${turn}/${MAX_TURNS} ──────────────────────────────────────────`);

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages,
      tools,
      tool_choice: "auto",
    });

    const message = response.choices[0].message;
    messages.push(message);

    if (message.content) {
      console.log();
      console.log("  Agent:", message.content.slice(0, 500));
      if (message.content.length > 500) console.log("  ...(truncated)");
      console.log();
    }

    if (!message.tool_calls || message.tool_calls.length === 0) {
      console.log("  (Agent finished — no more tool calls)");
      break;
    }

    for (const toolCall of message.tool_calls) {
      const toolName = (toolCall as { function: { name: string; arguments: string } }).function.name;
      const toolArgs = JSON.parse((toolCall as { function: { name: string; arguments: string } }).function.arguments || "{}");
      console.log(`  -> ${toolName}(${JSON.stringify(toolArgs).slice(0, 100)})`);

      let result: string;
      try {
        result = await executeTool(toolName, toolArgs, state, challengeId);
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.log(`  ✗ Error: ${errMsg.slice(0, 300)}`);
        result = JSON.stringify({ error: errMsg });
      }

      const preview = result.length > 300 ? result.slice(0, 300) + "..." : result;
      console.log(`  <- ${preview}`);
      console.log();

      messages.push({ role: "tool", tool_call_id: toolCall.id, content: result });
    }
  }

  // ── Final Report ──────────────────────────────────────────────────────

  console.log();
  console.log("╔═══════════════════════════════════════════════════════════╗");
  console.log("║              ADRENA AGENT — RUN COMPLETE                  ║");
  console.log("╠═══════════════════════════════════════════════════════════╣");
  console.log(`║  Wallet:       ${state.wallet.publicKey.toBase58().slice(0, 20)}...`);
  console.log(`║  Challenge:    ${challengeId}`);
  console.log(`║  Trades:       ${state.tradeCount}`);
  console.log(`║  PnL:          ${state.totalPnlBps > 0 ? "+" : ""}${state.totalPnlBps} bps`);
  console.log(`║  Drawdown:     ${Math.abs(state.maxDrawdownBps)} bps`);
  console.log(`║  Result:       ${state.totalPnlBps >= 800 ? "PASSED" : "FAILED"}`);
  console.log("║");
  console.log("║  On-Chain Transactions:");
  for (const tx of state.txLog) {
    console.log(`║    ${tx.instruction.padEnd(30)} ${tx.explorer}`);
  }
  console.log("╚═══════════════════════════════════════════════════════════╝");
}

main().catch((err) => {
  console.error("\nFatal error:", err);
  process.exit(1);
});
