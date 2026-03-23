import "dotenv/config";
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  VersionedTransaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import * as crypto from "crypto";
import {
  fetchCloseLong,
  fetchCloseShort,
  fetchLiquidityInfo,
  fetchOpenLimitLong,
  fetchOpenLimitShort,
  fetchOpenLong,
  fetchOpenShort,
} from "../lib/adrena/client.ts";

const SURFPOOL_URL = process.env.SURFPOOL_URL ?? "http://localhost:8899";
const MAINNET_URL = "https://api.mainnet-beta.solana.com";
const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
const USDC_MINT = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
const ADRENA_PROGRAM_ID = new PublicKey("13gDzEXCdocbj8iAiqrScGo47NiSuYENGsRqi3SEAwet");
const SYSVAR_CLOCK = new PublicKey("SysvarC1ock11111111111111111111111111111111");
const ADRENA_ORACLE_DISC = crypto.createHash("sha256").update("account:Oracle").digest().subarray(0, 8);

const connection = new Connection(SURFPOOL_URL, "confirmed");
const mainnetConnection = new Connection(MAINNET_URL, "confirmed");

const TEST_TOKEN_SYMBOL = (process.env.ADRENA_TEST_TOKEN_SYMBOL ?? "JITOSOL").toUpperCase();
const TEST_COLLATERAL_SYMBOL = (process.env.ADRENA_TEST_COLLATERAL_TOKEN_SYMBOL ?? "USDC").toUpperCase();
const TEST_COLLATERAL_AMOUNT = Number(process.env.ADRENA_TEST_COLLATERAL_AMOUNT ?? "0.5");
const TEST_LEVERAGE = Number(process.env.ADRENA_TEST_LEVERAGE ?? "3");
const TEST_SIDE = (
  process.env.ADRENA_TEST_SIDE ??
  (TEST_COLLATERAL_SYMBOL === "USDC" && TEST_TOKEN_SYMBOL !== "USDC" ? "short" : "long")
).toLowerCase() as "long" | "short";
const TEST_ORDER_KIND = (
  process.env.ADRENA_TEST_ORDER_KIND ??
  (TEST_COLLATERAL_SYMBOL === "USDC" && TEST_TOKEN_SYMBOL !== "USDC" ? "limit" : "market")
).toLowerCase() as "market" | "limit";
const CLOSE_AFTER_OPEN = process.env.ADRENA_TEST_CLOSE_AFTER_OPEN === "true";
const DEFAULT_RAW_SEED_BALANCE = 1_000_000_000n;

let rpcId = 0;

async function surfnetRpc(method: string, params?: unknown[]): Promise<unknown> {
  const body: Record<string, unknown> = { jsonrpc: "2.0", id: ++rpcId, method };
  if (params) body.params = params;
  const response = await fetch(SURFPOOL_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = (await response.json()) as { result?: unknown; error?: { message: string } };
  if (payload.error) throw new Error(`RPC ${method}: ${payload.error.message}`);
  return payload.result;
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
  address: PublicKey,
  mint: PublicKey,
  owner: PublicKey,
  amount: bigint
): Promise<void> {
  const data = Buffer.alloc(165);
  mint.toBuffer().copy(data, 0);
  owner.toBuffer().copy(data, 32);
  data.writeBigUInt64LE(amount, 64);
  data.writeUInt8(1, 108);
  await setAccount(address, { lamports: 2_039_280, data, owner: TOKEN_PROGRAM_ID });
}

function findAta(owner: PublicKey, mint: PublicKey): PublicKey {
  const [ata] = PublicKey.findProgramAddressSync(
    [owner.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
  return ata;
}

function findAdrenaUserProfilePda(owner: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("user_profile"), owner.toBuffer()],
    ADRENA_PROGRAM_ID
  )[0];
}

async function ensureAdrenaUserProfile(wallet: Keypair): Promise<PublicKey> {
  const userProfilePda = findAdrenaUserProfilePda(wallet.publicKey);
  const existing = await connection.getAccountInfo(userProfilePda);
  if (existing) {
    console.log(`  UserProfile already exists (${userProfilePda.toBase58().slice(0, 20)}...)`);
    return userProfilePda;
  }

  const [, bump] = PublicKey.findProgramAddressSync(
    [Buffer.from("user_profile"), wallet.publicKey.toBuffer()],
    ADRENA_PROGRAM_ID
  );
  const data = Buffer.alloc(408, 0);
  crypto.createHash("sha256").update("account:UserProfile").digest().subarray(0, 8).copy(data, 0);
  data.writeUInt8(bump, 8);
  wallet.publicKey.toBuffer().copy(data, 56);
  await setAccount(userProfilePda, {
    lamports: 2_039_280 + 408 * 6_960,
    data,
    owner: ADRENA_PROGRAM_ID,
  });
  console.log(`✓ UserProfile created at ${userProfilePda.toBase58().slice(0, 20)}...`);
  return userProfilePda;
}

async function getSurfpoolUnixTimestamp(): Promise<bigint> {
  const info = await connection.getAccountInfo(SYSVAR_CLOCK);
  if (!info) throw new Error("Clock sysvar missing on Surfpool");
  return Buffer.from(info.data).readBigInt64LE(32);
}

/**
 * Patch ALL oracle entry timestamps to match Surfpool's clock.
 *
 * OraclePrice layout (64 bytes, #[repr(C)]):
 *   +0  price (u64)       +8  confidence (u64)
 *   +16 timestamp (i64)   +24 exponent (i32)
 *   +28 feed_id (u8)      +29 padding (3 bytes)
 *   +32 name (LimitedString, 32 bytes – last byte = length)
 *
 * Prices array starts at offset 24 in the Oracle account
 * (after 8-byte discriminator + 1 bump + 7 padding + 8 updated_at).
 */
const ORACLE_PRICES_START = 24;
const ORACLE_ENTRY_SIZE = 64;

function patchOracleTimestamps(data: Buffer, unixTimestamp: bigint): number {
  // Update header updated_at
  data.writeBigInt64LE(unixTimestamp, 16);

  let patched = 0;
  for (let i = 0; i < 20; i++) {
    const base = ORACLE_PRICES_START + i * ORACLE_ENTRY_SIZE;
    if (base + ORACLE_ENTRY_SIZE > data.length) break;

    // Check if entry is populated by reading the name length (last byte of LimitedString)
    const nameLen = data[base + 32 + 31];
    if (nameLen === 0 || nameLen > 31) continue;

    const name = data.subarray(base + 32, base + 32 + nameLen).toString("ascii");

    // If USDCUSD has zero price, inject a synthetic $1.00
    if (name === "USDCUSD" && data.readBigUInt64LE(base) === 0n) {
      data.writeBigUInt64LE(10_000_000_000n, base);      // price
      data.writeBigUInt64LE(0n, base + 8);                // confidence
      data.writeInt32LE(-10, base + 24);                  // exponent
    }

    // Patch timestamp to current Surfpool clock
    data.writeBigInt64LE(unixTimestamp, base + 16);
    patched++;
  }

  return patched;
}

async function cloneAltsToSurfpool(vtx: VersionedTransaction): Promise<void> {
  for (const lookup of vtx.message.addressTableLookups) {
    const info = await mainnetConnection.getAccountInfo(lookup.accountKey);
    if (!info) continue;
    await setAccount(lookup.accountKey, {
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
  const infos = await mainnetConnection.getMultipleAccountsInfo(candidateKeys);
  // Add 60s buffer so oracle stays fresh through simulation + send
  const surfpoolUnixTimestamp = (await getSurfpoolUnixTimestamp()) + 60n;

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
    const patched = patchOracleTimestamps(data, surfpoolUnixTimestamp);
    if (patched > 0) {
      console.log(`✓ Patched ${patched} oracle timestamp${patched === 1 ? "" : "s"} on ${candidateKeys[i].toBase58().slice(0, 20)}...`);
    }

    await setAccount(candidateKeys[i], {
      lamports: info.lamports,
      data,
      owner: info.owner,
    });
  }
}

function buildPreparedInstructions(vtx: VersionedTransaction, userProfilePda: PublicKey): TransactionInstruction[] {
  const keys = vtx.message.staticAccountKeys;

  return vtx.message.compiledInstructions.map((compiledIx) => {
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
}

async function simulateAndSend(
  instructions: TransactionInstruction[],
  wallet: Keypair,
  label: string
): Promise<string> {
  const tx = new Transaction().add(...instructions);
  tx.feePayer = wallet.publicKey;
  tx.recentBlockhash = (await connection.getLatestBlockhash("confirmed")).blockhash;

  console.log(`\nSimulating ${label}...`);
  const simulation = await connection.simulateTransaction(tx, [wallet]);
  if (simulation.value.err) {
    console.error(`${label} simulation failed:`, JSON.stringify(simulation.value.err));
    for (const log of simulation.value.logs ?? []) console.error(" ", log);
    throw new Error(`${label} simulation failed`);
  }
  console.log(`✓ ${label} simulation passed`);

  const signature = await sendAndConfirmTransaction(connection, tx, [wallet], {
    commitment: "confirmed",
    skipPreflight: true,
  });
  console.log(`✓ ${label} signature: ${signature}`);
  return signature;
}

async function simulateAndSendVersionedTx(
  vtx: VersionedTransaction,
  wallet: Keypair,
  label: string
): Promise<string> {
  vtx.message.recentBlockhash = (await connection.getLatestBlockhash("confirmed")).blockhash;
  vtx.sign([wallet]);

  console.log(`\nSimulating ${label}...`);
  const simulation = await connection.simulateTransaction(vtx);
  if (simulation.value.err) {
    console.error(`${label} simulation failed:`, JSON.stringify(simulation.value.err));
    for (const log of simulation.value.logs ?? []) console.error(" ", log);
    throw new Error(`${label} simulation failed`);
  }
  console.log(`✓ ${label} simulation passed`);

  const signature = await connection.sendRawTransaction(vtx.serialize(), { skipPreflight: true });
  await connection.confirmTransaction(signature, "confirmed");
  console.log(`✓ ${label} signature: ${signature}`);
  return signature;
}

async function fetchOpenTrade(account: string) {
  if (TEST_ORDER_KIND === "limit") {
    throw new Error("fetchOpenTrade called for limit order");
  }

  if (TEST_SIDE === "short") {
    return fetchOpenShort({
      account,
      collateralAmount: TEST_COLLATERAL_AMOUNT,
      collateralTokenSymbol: TEST_COLLATERAL_SYMBOL,
      tokenSymbol: TEST_TOKEN_SYMBOL,
      leverage: TEST_LEVERAGE,
    });
  }

  return fetchOpenLong({
    account,
    collateralAmount: TEST_COLLATERAL_AMOUNT,
    collateralTokenSymbol: TEST_COLLATERAL_SYMBOL,
    tokenSymbol: TEST_TOKEN_SYMBOL,
    leverage: TEST_LEVERAGE,
  });
}

function deriveLimitPrices(referencePrice: number): { triggerPrice: number; limitPrice: number } {
  if (TEST_SIDE === "short") {
    return {
      triggerPrice: Number((referencePrice * 1.02).toFixed(8)),
      limitPrice: Number((referencePrice * 1.01).toFixed(8)),
    };
  }

  return {
    triggerPrice: Number((referencePrice * 0.98).toFixed(8)),
    limitPrice: Number((referencePrice * 0.99).toFixed(8)),
  };
}

async function fetchLimitOpenTrade(account: string) {
  const referenceQuote = TEST_SIDE === "short"
    ? await fetchOpenShort({
        account,
        collateralAmount: TEST_COLLATERAL_AMOUNT,
        collateralTokenSymbol: TEST_COLLATERAL_SYMBOL,
        tokenSymbol: TEST_TOKEN_SYMBOL,
        leverage: TEST_LEVERAGE,
      })
    : await fetchOpenLong({
        account,
        collateralAmount: TEST_COLLATERAL_AMOUNT,
        collateralTokenSymbol: TEST_COLLATERAL_SYMBOL,
        tokenSymbol: TEST_TOKEN_SYMBOL,
        leverage: TEST_LEVERAGE,
      });

  const { triggerPrice, limitPrice } = deriveLimitPrices(referenceQuote.quote.entryPrice);

  if (TEST_SIDE === "short") {
    return fetchOpenLimitShort({
      account,
      collateralTokenSymbol: "USDC",
      tokenSymbol: TEST_TOKEN_SYMBOL,
      collateralAmount: TEST_COLLATERAL_AMOUNT,
      leverage: TEST_LEVERAGE,
      triggerPrice,
      limitPrice,
    });
  }

  return fetchOpenLimitLong({
    account,
    collateralTokenSymbol: TEST_COLLATERAL_SYMBOL,
    tokenSymbol: TEST_TOKEN_SYMBOL,
    collateralAmount: TEST_COLLATERAL_AMOUNT,
    leverage: TEST_LEVERAGE,
    triggerPrice,
    limitPrice,
  });
}

async function fetchCloseTrade(account: string) {
  if (TEST_SIDE === "short") {
    return fetchCloseShort({
      account,
      collateralTokenSymbol: "USDC",
      tokenSymbol: TEST_TOKEN_SYMBOL,
    });
  }

  return fetchCloseLong({
    account,
    collateralTokenSymbol: TEST_TOKEN_SYMBOL,
    tokenSymbol: TEST_TOKEN_SYMBOL,
  });
}

async function main() {
  const raw = process.env.AGENT_KEYPAIR;
  if (!raw) throw new Error("AGENT_KEYPAIR is not set");
  const wallet = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw) as number[]));

  console.log("Wallet:", wallet.publicKey.toBase58());
  console.log(`Mode: ${TEST_ORDER_KIND.toUpperCase()} ${TEST_SIDE.toUpperCase()} ${TEST_TOKEN_SYMBOL} with ${TEST_COLLATERAL_AMOUNT} ${TEST_COLLATERAL_SYMBOL} @ ${TEST_LEVERAGE}x`);

  await setAccount(wallet.publicKey, { lamports: 100_000_000_000 });
  await createRawTokenAccount(findAta(wallet.publicKey, USDC_MINT), USDC_MINT, wallet.publicKey, 100_000_000n);
  console.log("✓ Funded 100 SOL + 100 USDC");

  const liquidity = await fetchLiquidityInfo();
  for (const custody of liquidity.custodies) {
    if (custody.mint === USDC_MINT.toBase58()) continue;
    const mint = new PublicKey(custody.mint);
    await createRawTokenAccount(findAta(wallet.publicKey, mint), mint, wallet.publicKey, DEFAULT_RAW_SEED_BALANCE);
    console.log(`✓ Seeded ATA for ${custody.symbol}`);
  }

  const userProfilePda = await ensureAdrenaUserProfile(wallet);

  console.log(`\nFetching ${TEST_ORDER_KIND} ${TEST_SIDE} transaction from Data API...`);
  const openPayload = TEST_ORDER_KIND === "limit"
    ? await fetchLimitOpenTrade(wallet.publicKey.toBase58())
    : await fetchOpenTrade(wallet.publicKey.toBase58());
  console.log("✓ Got Data API tx");
  console.log("Quote:", JSON.stringify(openPayload.quote));

  const openVtx = VersionedTransaction.deserialize(Buffer.from(openPayload.transaction, "base64"));
  await cloneAltsToSurfpool(openVtx);
  await cloneAdrenaOraclesToSurfpool(openVtx);

  if (TEST_ORDER_KIND === "limit") {
    await simulateAndSendVersionedTx(openVtx, wallet, `open-limit-${TEST_SIDE}`);
    return;
  }

  const openInstructions = buildPreparedInstructions(openVtx, userProfilePda);
  await simulateAndSend(openInstructions, wallet, `open-${TEST_SIDE}`);

  if (!CLOSE_AFTER_OPEN) return;

  console.log(`\nFetching close-${TEST_SIDE} transaction from Data API...`);
  const closePayload = await fetchCloseTrade(wallet.publicKey.toBase58());
  console.log("✓ Got close tx");

  const closeVtx = VersionedTransaction.deserialize(Buffer.from(closePayload.transaction, "base64"));
  await cloneAltsToSurfpool(closeVtx);
  await cloneAdrenaOraclesToSurfpool(closeVtx);

  const closeInstructions = buildPreparedInstructions(closeVtx, userProfilePda);
  await simulateAndSend(closeInstructions, wallet, `close-${TEST_SIDE}`);
}

main().catch((error) => {
  console.error("Fatal:", error);
  process.exit(1);
});
