/**
 * Surfpool-native agent tools.
 *
 * These tools operate against a local Surfpool instance instead of the
 * Adrena Data API.  They give an AI agent the ability to:
 *   - Read on-chain state (balances, challenges, enrollments, agent PDA)
 *   - Analyze price data with SDK playbooks (TrendSurfer, FadeTrader, etc.)
 *   - Execute Shoot program instructions (register, enroll, submit, settle)
 *   - Manage the full competition lifecycle autonomously
 */

import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  SystemProgram,
  sendAndConfirmTransaction,
  SYSVAR_RENT_PUBKEY,
} from "@solana/web3.js";
import * as crypto from "crypto";
import {
  TrendSurfer,
  FadeTrader,
  RangeSniper,
  FundingArb,
  GridRunner,
  RiskHarness,
  ReplayTap,
  DEFAULT_GUARDRAILS,
  SHOOT_PROGRAM_ID,
} from "../../sdk/dist/index.js";
import type { Bar, Verdict, Playbook } from "../../sdk/dist/core/types.js";

// ── Constants ───────────────────────────────────────────────────────────────

const TOKEN_PROGRAM_ID = new PublicKey(
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
);
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey(
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
);

// ── Borsh helpers ───────────────────────────────────────────────────────────

function disc(name: string): Buffer {
  return Buffer.from(
    crypto
      .createHash("sha256")
      .update("global:" + name)
      .digest()
      .subarray(0, 8)
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

// ── PDA derivation ──────────────────────────────────────────────────────────

export function findChallengePda(
  admin: PublicKey,
  challengeId: string
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("challenge"), admin.toBuffer(), Buffer.from(challengeId)],
    SHOOT_PROGRAM_ID
  );
}

export function findVaultPda(challengePda: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), challengePda.toBuffer()],
    SHOOT_PROGRAM_ID
  );
}

export function findEnrollmentPda(
  challengePda: PublicKey,
  trader: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("enrollment"), challengePda.toBuffer(), trader.toBuffer()],
    SHOOT_PROGRAM_ID
  );
}

export function findAgentPda(owner: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("agent"), owner.toBuffer(), owner.toBuffer().subarray(0, 8)],
    SHOOT_PROGRAM_ID
  );
}

export function findAta(owner: PublicKey, mint: PublicKey): PublicKey {
  const [ata] = PublicKey.findProgramAddressSync(
    [owner.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
  return ata;
}

// ── Account decoders ────────────────────────────────────────────────────────

function decodeString(data: Buffer, offset: number): [string, number] {
  const len = data.readUInt32LE(offset);
  const str = data.subarray(offset + 4, offset + 4 + len).toString("utf-8");
  return [str, offset + 4 + len];
}

export function decodeChallenge(data: Buffer) {
  let offset = 8; // skip discriminator
  const admin = new PublicKey(data.subarray(offset, offset + 32));
  offset += 32;
  const resultAuthority = new PublicKey(data.subarray(offset, offset + 32));
  offset += 32;
  let challengeId: string;
  [challengeId, offset] = decodeString(data, offset);
  let tierName: string;
  [tierName, offset] = decodeString(data, offset);
  const entryFeeUsdc = data.readBigUInt64LE(offset);
  offset += 8;
  const profitTargetBps = data.readUInt16LE(offset);
  offset += 2;
  const maxDrawdownBps = data.readUInt16LE(offset);
  offset += 2;
  const dailyLossLimitBps = data.readUInt16LE(offset);
  offset += 2;
  const durationSeconds = data.readBigInt64LE(offset);
  offset += 8;
  const minCapitalUsd = data.readBigUInt64LE(offset);
  offset += 8;
  const participantCap = data.readUInt16LE(offset);
  offset += 2;
  const enrolledCount = data.readUInt16LE(offset);
  offset += 2;
  const status = data.readUInt8(offset);

  return {
    admin: admin.toBase58(),
    resultAuthority: resultAuthority.toBase58(),
    challengeId,
    tierName,
    entryFeeUsdc: Number(entryFeeUsdc) / 1_000_000,
    profitTargetBps,
    maxDrawdownBps,
    dailyLossLimitBps,
    durationSeconds: Number(durationSeconds),
    minCapitalUsd: Number(minCapitalUsd) / 1_000_000,
    participantCap,
    enrolledCount,
    status: ["Active", "Settling", "Closed"][status] ?? "Unknown",
  };
}

export function decodeEnrollment(data: Buffer) {
  let offset = 8;
  const trader = new PublicKey(data.subarray(offset, offset + 32));
  offset += 32;
  const challenge = new PublicKey(data.subarray(offset, offset + 32));
  offset += 32;
  const startingEquityUsd = data.readBigUInt64LE(offset);
  offset += 8;
  const enrolledAt = data.readBigInt64LE(offset);
  offset += 8;
  const settled = data.readUInt8(offset) === 1;
  offset += 1;
  const status = data.readUInt8(offset);
  offset += 1;
  const finalPnlBps = data.readInt32LE(offset);
  offset += 4;
  const finalDrawdownBps = data.readUInt16LE(offset);
  offset += 2;
  const payoutUsdc = data.readBigUInt64LE(offset);

  return {
    trader: trader.toBase58(),
    challenge: challenge.toBase58(),
    startingEquityUsd: Number(startingEquityUsd) / 1_000_000,
    enrolledAt: Number(enrolledAt),
    settled,
    status: ["Active", "Passed", "FailedDrawdown", "FailedDailyLimit", "FailedTimeout"][status] ?? "Unknown",
    finalPnlBps,
    finalDrawdownBps,
    payoutUsdc: Number(payoutUsdc) / 1_000_000,
  };
}

export function decodeAgent(data: Buffer) {
  let offset = 8;
  const owner = new PublicKey(data.subarray(offset, offset + 32));
  offset += 32;
  let name: string;
  [name, offset] = decodeString(data, offset);
  const strategyHash = data.subarray(offset, offset + 32).toString("hex");
  offset += 32;
  const eloRating = data.readUInt32LE(offset);
  offset += 4;
  const wins = data.readUInt32LE(offset);
  offset += 4;
  const losses = data.readUInt32LE(offset);
  offset += 4;
  const totalTrades = data.readUInt32LE(offset);
  offset += 4;
  const totalPnlBps = Number(data.readBigInt64LE(offset));
  offset += 8;
  const competitionsEntered = data.readUInt16LE(offset);
  offset += 2;
  const status = data.readUInt8(offset);

  return {
    owner: owner.toBase58(),
    name,
    strategyHash,
    eloRating,
    wins,
    losses,
    totalTrades,
    totalPnlBps,
    competitionsEntered,
    status: ["Active", "Suspended", "Retired"][status] ?? "Unknown",
  };
}

// ── Surfnet RPC ─────────────────────────────────────────────────────────────

let rpcId = 0;

export async function surfnetRpc(
  rpcUrl: string,
  method: string,
  params?: unknown[]
): Promise<unknown> {
  const body: Record<string, unknown> = {
    jsonrpc: "2.0",
    id: ++rpcId,
    method,
  };
  if (params) body.params = params;

  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as {
    result?: unknown;
    error?: { message: string };
  };
  if (json.error) throw new Error(`RPC ${method}: ${json.error.message}`);
  return json.result;
}

// ── Tool context (shared state for the agent run) ───────────────────────────

export interface AgentContext {
  connection: Connection;
  rpcUrl: string;
  agentKeypair: Keypair;
  adminKeypair: Keypair;
  resultAuthorityKeypair: Keypair;
  usdcMint: PublicKey;
  /** Mutable state tracked across tool calls */
  challengeId?: string;
  challengePda?: PublicKey;
  vaultPda?: PublicKey;
  enrollmentPda?: PublicKey;
  agentPda?: PublicKey;
  /** Synthetic price bars for market analysis */
  priceBars: Bar[];
  /** Tracking */
  totalPnlBps: number;
  maxDrawdownBps: number;
  tradeCount: number;
  txSignatures: string[];
}

async function sendTx(
  ctx: AgentContext,
  ixs: TransactionInstruction[],
  signers: Keypair[]
): Promise<string> {
  const tx = new Transaction().add(...ixs);
  const sig = await sendAndConfirmTransaction(ctx.connection, tx, signers, {
    commitment: "confirmed",
  });
  ctx.txSignatures.push(sig);
  return sig;
}

// ── Tool definitions (OpenAI function-calling schema) ───────────────────────

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute: (ctx: AgentContext, args: Record<string, unknown>) => Promise<string>;
}

export function createSurfpoolTools(): ToolDefinition[] {
  return [
    // ── Read tools ────────────────────────────────────────────────────

    {
      name: "getBalance",
      description:
        "Check the SOL balance and USDC token balance of the agent's wallet.",
      parameters: { type: "object", properties: {}, required: [] },
      execute: async (ctx) => {
        const sol = await ctx.connection.getBalance(ctx.agentKeypair.publicKey);
        const ata = findAta(ctx.agentKeypair.publicKey, ctx.usdcMint);
        const ataInfo = await ctx.connection.getAccountInfo(ata);
        let usdcBalance = 0;
        if (ataInfo) {
          const data = Buffer.from(ataInfo.data);
          usdcBalance = Number(data.readBigUInt64LE(64)) / 1_000_000;
        }
        return JSON.stringify({
          wallet: ctx.agentKeypair.publicKey.toBase58(),
          solBalance: sol / 1_000_000_000,
          usdcBalance,
        });
      },
    },

    {
      name: "getChallenge",
      description:
        "Read the on-chain state of the current challenge (status, enrolled count, profit target, etc.).",
      parameters: { type: "object", properties: {}, required: [] },
      execute: async (ctx) => {
        if (!ctx.challengePda) return JSON.stringify({ error: "No challenge created yet. Use createChallenge first." });
        const info = await ctx.connection.getAccountInfo(ctx.challengePda);
        if (!info) return JSON.stringify({ error: "Challenge account not found on-chain." });
        return JSON.stringify(decodeChallenge(Buffer.from(info.data)));
      },
    },

    {
      name: "getEnrollment",
      description:
        "Read the on-chain enrollment state (status, PnL, drawdown, settled).",
      parameters: { type: "object", properties: {}, required: [] },
      execute: async (ctx) => {
        if (!ctx.enrollmentPda) return JSON.stringify({ error: "Not enrolled yet. Use enrollInChallenge first." });
        const info = await ctx.connection.getAccountInfo(ctx.enrollmentPda);
        if (!info) return JSON.stringify({ error: "Enrollment account not found." });
        return JSON.stringify(decodeEnrollment(Buffer.from(info.data)));
      },
    },

    {
      name: "getAgentInfo",
      description:
        "Read the on-chain Agent PDA: name, strategy hash, ELO, wins/losses, trade count.",
      parameters: { type: "object", properties: {}, required: [] },
      execute: async (ctx) => {
        const [agentPda] = findAgentPda(ctx.agentKeypair.publicKey);
        const info = await ctx.connection.getAccountInfo(agentPda);
        if (!info) return JSON.stringify({ error: "Agent not registered yet. Use registerAgent first." });
        return JSON.stringify(decodeAgent(Buffer.from(info.data)));
      },
    },

    {
      name: "getMarketData",
      description:
        "Get the latest SOL price data (OHLCV bars). Returns the most recent bars for technical analysis.",
      parameters: {
        type: "object",
        properties: {
          count: {
            type: "number",
            description: "Number of bars to return (max 100)",
          },
        },
        required: [],
      },
      execute: async (ctx, args) => {
        const count = Math.min(Number(args.count) || 20, 100);
        const end = ctx.priceBars.length;
        const start = Math.max(0, end - count);
        const bars = ctx.priceBars.slice(start, end);
        const latest = bars[bars.length - 1];
        return JSON.stringify({
          symbol: "SOL",
          barsReturned: bars.length,
          latestPrice: latest?.c.toFixed(2),
          latestHigh: latest?.h.toFixed(2),
          latestLow: latest?.l.toFixed(2),
          priceRange: `$${Math.min(...bars.map((b) => b.l)).toFixed(2)} - $${Math.max(...bars.map((b) => b.h)).toFixed(2)}`,
          trend:
            bars.length > 10
              ? bars[bars.length - 1].c > bars[bars.length - 10].c
                ? "bullish"
                : "bearish"
              : "insufficient data",
        });
      },
    },

    // ── Analysis tools ────────────────────────────────────────────────

    {
      name: "analyzeMarket",
      description:
        "Run a trading strategy analysis on current market data. Returns a trade verdict (buy/sell/exit/pass) with conviction score. Available strategies: TrendSurfer, FadeTrader, RangeSniper, FundingArb, GridRunner.",
      parameters: {
        type: "object",
        properties: {
          strategy: {
            type: "string",
            enum: [
              "TrendSurfer",
              "FadeTrader",
              "RangeSniper",
              "FundingArb",
              "GridRunner",
            ],
            description: "Which strategy playbook to run",
          },
        },
        required: ["strategy"],
      },
      execute: async (ctx, args) => {
        const strategyName = args.strategy as string;
        const playbooks: Record<string, Playbook> = {
          TrendSurfer: new TrendSurfer(),
          FadeTrader: new FadeTrader(),
          RangeSniper: new RangeSniper(),
          FundingArb: new FundingArb(),
          GridRunner: new GridRunner(),
        };
        const playbook = playbooks[strategyName];
        if (!playbook)
          return JSON.stringify({
            error: `Unknown strategy: ${strategyName}`,
          });

        const verdict = playbook.assess(ctx.priceBars, null);
        const latest = ctx.priceBars[ctx.priceBars.length - 1];
        return JSON.stringify({
          strategy: strategyName,
          currentPrice: latest?.c.toFixed(2),
          verdict: verdict.kind,
          ...(verdict.kind === "buy" || verdict.kind === "sell"
            ? {
                conviction: (verdict.conviction * 100).toFixed(0) + "%",
                allocation: (verdict.allocation * 100).toFixed(0) + "% of bankroll",
              }
            : {}),
          ...(verdict.kind === "exit" ? { reason: verdict.memo } : {}),
        });
      },
    },

    // ── Action tools ──────────────────────────────────────────────────

    {
      name: "registerAgent",
      description:
        "Register the autonomous trading agent on-chain. Creates an Agent PDA with strategy name and hash. This must be done before participating in competitions.",
      parameters: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "Agent name (max 32 chars)",
          },
          strategy: {
            type: "string",
            description: "Strategy identifier for hashing",
          },
        },
        required: ["name", "strategy"],
      },
      execute: async (ctx, args) => {
        const name = (args.name as string).slice(0, 32);
        const strategyHash = crypto
          .createHash("sha256")
          .update(args.strategy as string)
          .digest();
        const [agentPda] = findAgentPda(ctx.agentKeypair.publicKey);
        ctx.agentPda = agentPda;

        const ix = new TransactionInstruction({
          programId: SHOOT_PROGRAM_ID,
          keys: [
            { pubkey: ctx.agentKeypair.publicKey, isSigner: true, isWritable: true },
            { pubkey: agentPda, isSigner: false, isWritable: true },
            { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
          ],
          data: Buffer.concat([
            disc("register_agent"),
            encodeString(name),
            Buffer.from(strategyHash),
          ]),
        });

        const sig = await sendTx(ctx, [ix], [ctx.agentKeypair]);
        return JSON.stringify({
          success: true,
          agentPda: agentPda.toBase58(),
          name,
          strategyHash: strategyHash.toString("hex").slice(0, 16) + "...",
          txSignature: sig,
        });
      },
    },

    {
      name: "createChallenge",
      description:
        "Create a new prop trading challenge on-chain. Sets up the competition with entry fee, profit target, drawdown limit, and duration.",
      parameters: {
        type: "object",
        properties: {
          tierName: {
            type: "string",
            description: "Challenge tier (e.g. Scout, Ranger, Veteran, Elite, Apex)",
          },
          entryFeeUsdc: {
            type: "number",
            description: "Entry fee in USDC",
          },
          profitTargetBps: {
            type: "number",
            description: "Profit target in basis points (e.g. 800 = 8%)",
          },
          maxDrawdownBps: {
            type: "number",
            description: "Maximum allowed drawdown in basis points",
          },
          durationDays: {
            type: "number",
            description: "Competition duration in days",
          },
        },
        required: ["tierName"],
      },
      execute: async (ctx, args) => {
        const challengeId = `agent-${Date.now()}`;
        const [challengePda] = findChallengePda(ctx.adminKeypair.publicKey, challengeId);
        const [vaultPda] = findVaultPda(challengePda);

        ctx.challengeId = challengeId;
        ctx.challengePda = challengePda;
        ctx.vaultPda = vaultPda;

        const entryFee = Number(args.entryFeeUsdc ?? 10) * 1_000_000;
        const profitTarget = Number(args.profitTargetBps ?? 800);
        const maxDrawdown = Number(args.maxDrawdownBps ?? 500);
        const durationDays = Number(args.durationDays ?? 7);

        const ix = new TransactionInstruction({
          programId: SHOOT_PROGRAM_ID,
          keys: [
            { pubkey: ctx.adminKeypair.publicKey, isSigner: true, isWritable: true },
            { pubkey: ctx.resultAuthorityKeypair.publicKey, isSigner: false, isWritable: false },
            { pubkey: challengePda, isSigner: false, isWritable: true },
            { pubkey: ctx.usdcMint, isSigner: false, isWritable: false },
            { pubkey: vaultPda, isSigner: false, isWritable: true },
            { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
            { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
            { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
          ],
          data: Buffer.concat([
            disc("initialize_challenge"),
            encodeString(challengeId),
            encodeString(args.tierName as string),
            encodeU64(entryFee),
            encodeU16(profitTarget),
            encodeU16(maxDrawdown),
            encodeU16(300), // daily loss limit
            encodeI64(durationDays * 24 * 60 * 60),
            encodeU64(50_000_000), // min capital
            encodeU16(128), // participant cap
          ]),
        });

        const sig = await sendTx(ctx, [ix], [ctx.adminKeypair]);
        return JSON.stringify({
          success: true,
          challengeId,
          challengePda: challengePda.toBase58(),
          tierName: args.tierName,
          entryFeeUsdc: entryFee / 1_000_000,
          profitTargetBps: profitTarget,
          maxDrawdownBps: maxDrawdown,
          durationDays,
          txSignature: sig,
        });
      },
    },

    {
      name: "enrollInChallenge",
      description:
        "Enroll the agent in the current challenge. Pays the USDC entry fee from the agent's wallet to the challenge vault.",
      parameters: {
        type: "object",
        properties: {
          startingEquityUsd: {
            type: "number",
            description: "Starting equity in USD (default: 500)",
          },
        },
        required: [],
      },
      execute: async (ctx, args) => {
        if (!ctx.challengePda || !ctx.vaultPda) {
          return JSON.stringify({ error: "No challenge created. Use createChallenge first." });
        }

        const equity = Number(args.startingEquityUsd ?? 500) * 1_000_000;
        const agentAta = findAta(ctx.agentKeypair.publicKey, ctx.usdcMint);
        const [enrollmentPda] = findEnrollmentPda(ctx.challengePda, ctx.agentKeypair.publicKey);
        ctx.enrollmentPda = enrollmentPda;

        const ix = new TransactionInstruction({
          programId: SHOOT_PROGRAM_ID,
          keys: [
            { pubkey: ctx.agentKeypair.publicKey, isSigner: true, isWritable: true },
            { pubkey: ctx.challengePda, isSigner: false, isWritable: true },
            { pubkey: enrollmentPda, isSigner: false, isWritable: true },
            { pubkey: agentAta, isSigner: false, isWritable: true },
            { pubkey: ctx.vaultPda, isSigner: false, isWritable: true },
            { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
            { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
          ],
          data: Buffer.concat([disc("enroll"), encodeU64(equity)]),
        });

        const sig = await sendTx(ctx, [ix], [ctx.agentKeypair]);
        return JSON.stringify({
          success: true,
          enrollmentPda: enrollmentPda.toBase58(),
          startingEquityUsd: equity / 1_000_000,
          txSignature: sig,
        });
      },
    },

    {
      name: "executeTrade",
      description:
        "Execute a trade based on market analysis. Runs the specified playbook, gets a verdict, and records the trade. The trade is tracked off-chain for PnL calculation since Adrena perp program is not deployed locally.",
      parameters: {
        type: "object",
        properties: {
          strategy: {
            type: "string",
            enum: ["TrendSurfer", "FadeTrader", "RangeSniper", "FundingArb", "GridRunner"],
            description: "Strategy to use for the trade decision",
          },
          barsToAdvance: {
            type: "number",
            description: "Number of price bars to advance before analyzing (simulates time passing, default: 5)",
          },
        },
        required: ["strategy"],
      },
      execute: async (ctx, args) => {
        const advance = Number(args.barsToAdvance ?? 5);

        // Advance the price data
        const newBars = generateBars(advance, ctx.priceBars[ctx.priceBars.length - 1]?.c ?? 140);
        ctx.priceBars.push(...newBars);

        const playbooks: Record<string, Playbook> = {
          TrendSurfer: new TrendSurfer(),
          FadeTrader: new FadeTrader(),
          RangeSniper: new RangeSniper(),
          FundingArb: new FundingArb(),
          GridRunner: new GridRunner(),
        };

        const playbook = playbooks[args.strategy as string];
        if (!playbook) return JSON.stringify({ error: "Unknown strategy" });

        const harness = new RiskHarness({ ...DEFAULT_GUARDRAILS, pauseMs: 0 }, 500);
        const verdict = playbook.assess(ctx.priceBars, null);
        const latest = ctx.priceBars[ctx.priceBars.length - 1];

        if (verdict.kind === "buy" || verdict.kind === "sell") {
          ctx.tradeCount++;
          // Simulate PnL from the trade (simplified)
          const nextBars = generateBars(10, latest.c);
          const exitPrice = nextBars[nextBars.length - 1].c;
          const pnlBps = Math.round(
            verdict.kind === "buy"
              ? ((exitPrice - latest.c) / latest.c) * 10000
              : ((latest.c - exitPrice) / latest.c) * 10000
          );
          ctx.totalPnlBps += pnlBps;
          if (ctx.totalPnlBps < ctx.maxDrawdownBps) {
            ctx.maxDrawdownBps = ctx.totalPnlBps;
          }
          ctx.priceBars.push(...nextBars);

          return JSON.stringify({
            action: verdict.kind,
            entryPrice: latest.c.toFixed(2),
            exitPrice: exitPrice.toFixed(2),
            pnlBps,
            conviction: (verdict.conviction * 100).toFixed(0) + "%",
            cumulativePnlBps: ctx.totalPnlBps,
            maxDrawdownBps: ctx.maxDrawdownBps,
            totalTrades: ctx.tradeCount,
          });
        }

        return JSON.stringify({
          action: verdict.kind,
          currentPrice: latest.c.toFixed(2),
          message: verdict.kind === "exit" ? verdict.memo : "No actionable signal",
          cumulativePnlBps: ctx.totalPnlBps,
          totalTrades: ctx.tradeCount,
        });
      },
    },

    {
      name: "submitResult",
      description:
        "Submit the trading result on-chain. Records the final PnL and drawdown in the enrollment PDA. Call this when done trading.",
      parameters: { type: "object", properties: {}, required: [] },
      execute: async (ctx) => {
        if (!ctx.challengePda || !ctx.enrollmentPda) {
          return JSON.stringify({ error: "Not enrolled. Create and join a challenge first." });
        }

        const passed = ctx.totalPnlBps >= 800;
        const status = passed ? 1 : ctx.totalPnlBps <= -500 ? 2 : 4;

        const ix = new TransactionInstruction({
          programId: SHOOT_PROGRAM_ID,
          keys: [
            { pubkey: ctx.resultAuthorityKeypair.publicKey, isSigner: true, isWritable: false },
            { pubkey: ctx.challengePda, isSigner: false, isWritable: false },
            { pubkey: ctx.enrollmentPda, isSigner: false, isWritable: true },
          ],
          data: Buffer.concat([
            disc("submit_result"),
            encodeU8(status),
            encodeI32(ctx.totalPnlBps),
            encodeU16(Math.abs(ctx.maxDrawdownBps)),
          ]),
        });

        const sig = await sendTx(ctx, [ix], [ctx.resultAuthorityKeypair]);
        return JSON.stringify({
          success: true,
          passed,
          finalPnlBps: ctx.totalPnlBps,
          maxDrawdownBps: Math.abs(ctx.maxDrawdownBps),
          status: passed ? "Passed" : "Failed",
          txSignature: sig,
        });
      },
    },

    {
      name: "updateAgentStats",
      description:
        "Update the agent's on-chain stats (ELO, wins, losses, trade count) after a competition.",
      parameters: { type: "object", properties: {}, required: [] },
      execute: async (ctx) => {
        if (!ctx.challengePda || !ctx.agentPda) {
          return JSON.stringify({ error: "Agent not registered or no challenge." });
        }

        const passed = ctx.totalPnlBps >= 800;
        const statsData = Buffer.alloc(8 + 1 + 4 + 4 + 4);
        disc("update_agent_stats").copy(statsData, 0);
        statsData.writeUInt8(passed ? 1 : 0, 8);
        statsData.writeInt32LE(ctx.totalPnlBps, 9);
        statsData.writeUInt32LE(ctx.tradeCount, 13);
        statsData.writeUInt32LE(1200, 17);

        const ix = new TransactionInstruction({
          programId: SHOOT_PROGRAM_ID,
          keys: [
            { pubkey: ctx.resultAuthorityKeypair.publicKey, isSigner: true, isWritable: false },
            { pubkey: ctx.challengePda, isSigner: false, isWritable: false },
            { pubkey: ctx.agentPda, isSigner: false, isWritable: true },
          ],
          data: statsData,
        });

        const sig = await sendTx(ctx, [ix], [ctx.resultAuthorityKeypair]);
        return JSON.stringify({
          success: true,
          won: passed,
          totalPnlBps: ctx.totalPnlBps,
          tradeCount: ctx.tradeCount,
          newElo: 1200,
          txSignature: sig,
        });
      },
    },
  ];
}

// ── Helper: generate synthetic bars ─────────────────────────────────────────

function generateBars(count: number, startPrice: number): Bar[] {
  const bars: Bar[] = [];
  let price = startPrice;
  const now = Date.now();
  for (let i = 0; i < count; i++) {
    const trend = Math.sin(i / 12) * 4 + Math.sin(i / 30) * 6;
    const noise = (Math.random() - 0.5) * 3;
    price = Math.max(50, price + trend + noise);
    const vol = 1 + Math.random() * 2;
    bars.push({
      ts: now + i * 60_000,
      o: price - vol * 0.3,
      h: price + vol,
      l: price - vol,
      c: Math.max(price - vol, Math.min(price + vol, price + (Math.random() - 0.5) * vol)),
      vol: 10_000 + Math.random() * 50_000,
    });
  }
  return bars;
}

/** Generate initial bars for market data */
export function generateInitialBars(count: number, startPrice: number): Bar[] {
  return generateBars(count, startPrice);
}

/** Convert tool definitions to OpenAI function-calling format */
export function toolsToOpenAIFunctions(tools: ToolDefinition[]) {
  return tools.map((t) => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }));
}
