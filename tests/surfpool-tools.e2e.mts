/**
 * E2E tests for Surfpool agent tools.
 *
 * Verifies each tool function works correctly against a running Surfpool instance.
 *
 * Usage:
 *   cd programs/shoot && surfpool start --no-tui --yes --offline
 *   npm run test:agent-tools
 */

import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import {
  Connection,
  Keypair,
  PublicKey,
} from "@solana/web3.js";
import {
  createSurfpoolTools,
  generateInitialBars,
  findAta,
  findAgentPda,
  findChallengePda,
  findEnrollmentPda,
  surfnetRpc,
  type AgentContext,
  type ToolDefinition,
} from "../lib/agent/surfpool-tools.ts";

const SURFPOOL_URL = process.env.SURFPOOL_URL ?? "http://localhost:8899";
const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");

// ── Helpers ─────────────────────────────────────────────────────────────────

async function setAccount(
  pubkey: PublicKey,
  opts: { lamports?: number; data?: Buffer; owner?: PublicKey }
): Promise<void> {
  const params: Record<string, unknown> = {};
  if (opts.lamports !== undefined) params.lamports = opts.lamports;
  if (opts.data !== undefined) params.data = opts.data.toString("hex");
  if (opts.owner !== undefined) params.owner = opts.owner.toBase58();
  await surfnetRpc(SURFPOOL_URL, "surfnet_setAccount", [pubkey.toBase58(), params]);
}

// ── Test context ────────────────────────────────────────────────────────────

let ctx: AgentContext;
let tools: ToolDefinition[];
let toolMap: Map<string, ToolDefinition>;

async function callTool(name: string, args: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  const tool = toolMap.get(name);
  assert.ok(tool, `Tool ${name} not found`);
  const result = await tool.execute(ctx, args);
  return JSON.parse(result);
}

// ── Setup ───────────────────────────────────────────────────────────────────

before(async () => {
  const connection = new Connection(SURFPOOL_URL, "confirmed");

  // Verify Surfpool is running
  try {
    await connection.getSlot();
  } catch {
    console.error("Surfpool not running. Start with:");
    console.error("  cd programs/shoot && surfpool start --no-tui --yes --offline");
    process.exit(1);
  }

  ctx = {
    connection,
    rpcUrl: SURFPOOL_URL,
    agentKeypair: Keypair.generate(),
    adminKeypair: Keypair.generate(),
    resultAuthorityKeypair: Keypair.generate(),
    usdcMint: Keypair.generate().publicKey,
    priceBars: generateInitialBars(100, 140),
    totalPnlBps: 0,
    maxDrawdownBps: 0,
    tradeCount: 0,
    txSignatures: [],
  };

  // Fund accounts
  await setAccount(ctx.agentKeypair.publicKey, { lamports: 100_000_000_000 });
  await setAccount(ctx.adminKeypair.publicKey, { lamports: 100_000_000_000 });
  await setAccount(ctx.resultAuthorityKeypair.publicKey, { lamports: 100_000_000_000 });

  // Create USDC mint
  const mintData = Buffer.alloc(82);
  mintData.writeUInt32LE(1, 0);
  ctx.adminKeypair.publicKey.toBuffer().copy(mintData, 4);
  mintData.writeBigUInt64LE(BigInt(1_000_000_000_000), 36);
  mintData.writeUInt8(6, 44);
  mintData.writeUInt8(1, 45);
  await setAccount(ctx.usdcMint, { data: mintData, lamports: 1_000_000_000, owner: TOKEN_PROGRAM_ID });

  // Create agent USDC ATA with 100 USDC
  const ata = findAta(ctx.agentKeypair.publicKey, ctx.usdcMint);
  const tokenData = Buffer.alloc(165);
  ctx.usdcMint.toBuffer().copy(tokenData, 0);
  ctx.agentKeypair.publicKey.toBuffer().copy(tokenData, 32);
  tokenData.writeBigUInt64LE(BigInt(100_000_000), 64);
  tokenData.writeUInt8(1, 108);
  await setAccount(ata, { data: tokenData, lamports: 2_039_280, owner: TOKEN_PROGRAM_ID });

  tools = createSurfpoolTools();
  toolMap = new Map(tools.map((t) => [t.name, t]));
});

// ── Tests ───────────────────────────────────────────────────────────────────

describe("surfpool agent tools", { timeout: 60_000 }, () => {
  // ── Read tools ──────────────────────────────────────────────────────

  describe("read tools", () => {
    it("getBalance returns SOL and USDC balances", async () => {
      const result = await callTool("getBalance");
      assert.equal(result.solBalance, 100);
      assert.equal(result.usdcBalance, 100);
      assert.equal(result.wallet, ctx.agentKeypair.publicKey.toBase58());
    });

    it("getChallenge returns error when no challenge exists", async () => {
      const result = await callTool("getChallenge");
      assert.ok((result.error as string).includes("No challenge"));
    });

    it("getEnrollment returns error when not enrolled", async () => {
      const result = await callTool("getEnrollment");
      assert.ok((result.error as string).includes("Not enrolled"));
    });

    it("getAgentInfo returns error when not registered", async () => {
      const result = await callTool("getAgentInfo");
      assert.ok((result.error as string).includes("not registered"));
    });

    it("getMarketData returns price bars", async () => {
      const result = await callTool("getMarketData", { count: 10 });
      assert.equal(result.symbol, "SOL");
      assert.equal(result.barsReturned, 10);
      assert.ok(result.latestPrice);
      assert.ok(result.priceRange);
    });
  });

  // ── Analysis tools ──────────────────────────────────────────────────

  describe("analysis tools", () => {
    it("analyzeMarket with TrendSurfer returns a verdict", async () => {
      const result = await callTool("analyzeMarket", { strategy: "TrendSurfer" });
      assert.equal(result.strategy, "TrendSurfer");
      assert.ok(["buy", "sell", "exit", "pass"].includes(result.verdict as string));
    });

    it("analyzeMarket with FadeTrader returns a verdict", async () => {
      const result = await callTool("analyzeMarket", { strategy: "FadeTrader" });
      assert.equal(result.strategy, "FadeTrader");
      assert.ok(["buy", "sell", "exit", "pass"].includes(result.verdict as string));
    });

    it("analyzeMarket with RangeSniper returns a verdict", async () => {
      const result = await callTool("analyzeMarket", { strategy: "RangeSniper" });
      assert.equal(result.strategy, "RangeSniper");
    });

    it("analyzeMarket with FundingArb returns a verdict", async () => {
      const result = await callTool("analyzeMarket", { strategy: "FundingArb" });
      assert.equal(result.strategy, "FundingArb");
    });

    it("analyzeMarket with GridRunner returns a verdict", async () => {
      const result = await callTool("analyzeMarket", { strategy: "GridRunner" });
      assert.equal(result.strategy, "GridRunner");
    });

    it("analyzeMarket rejects unknown strategy", async () => {
      const result = await callTool("analyzeMarket", { strategy: "NonExistent" });
      assert.ok(result.error);
    });
  });

  // ── Action tools (sequential lifecycle) ─────────────────────────────

  describe("action tools — full lifecycle", () => {
    it("registerAgent creates agent PDA on-chain", async () => {
      const result = await callTool("registerAgent", {
        name: "TestBot",
        strategy: "TrendSurfer-v1",
      });
      assert.equal(result.success, true);
      assert.ok(result.agentPda);
      assert.equal(result.name, "TestBot");
      assert.ok(result.txSignature);
    });

    it("getAgentInfo reads registered agent", async () => {
      const result = await callTool("getAgentInfo");
      assert.equal(result.name, "TestBot");
      assert.equal(result.status, "Active");
      assert.equal(result.eloRating, 1000);
      assert.equal(result.wins, 0);
      assert.equal(result.losses, 0);
    });

    it("createChallenge creates challenge PDA on-chain", async () => {
      const result = await callTool("createChallenge", {
        tierName: "Scout",
        entryFeeUsdc: 10,
        profitTargetBps: 800,
        maxDrawdownBps: 500,
        durationDays: 7,
      });
      assert.equal(result.success, true);
      assert.ok(result.challengeId);
      assert.ok(result.challengePda);
      assert.equal(result.tierName, "Scout");
      assert.equal(result.profitTargetBps, 800);
    });

    it("getChallenge reads created challenge", async () => {
      const result = await callTool("getChallenge");
      assert.equal(result.tierName, "Scout");
      assert.equal(result.profitTargetBps, 800);
      assert.equal(result.maxDrawdownBps, 500);
      assert.equal(result.enrolledCount, 0);
      assert.equal(result.status, "Active");
    });

    it("enrollInChallenge enrolls agent and pays USDC", async () => {
      const result = await callTool("enrollInChallenge", {
        startingEquityUsd: 500,
      });
      assert.equal(result.success, true);
      assert.ok(result.enrollmentPda);
      assert.equal(result.startingEquityUsd, 500);
    });

    it("getEnrollment reads enrollment state", async () => {
      const result = await callTool("getEnrollment");
      assert.equal(result.status, "Active");
      assert.equal(result.settled, false);
      assert.equal(result.trader, ctx.agentKeypair.publicKey.toBase58());
    });

    it("getChallenge shows enrolled count = 1", async () => {
      const result = await callTool("getChallenge");
      assert.equal(result.enrolledCount, 1);
    });

    it("getBalance shows USDC decreased after enrollment", async () => {
      const result = await callTool("getBalance");
      assert.equal(result.usdcBalance, 90); // 100 - 10 entry fee
    });

    it("executeTrade records a trade and tracks PnL", async () => {
      const result = await callTool("executeTrade", {
        strategy: "TrendSurfer",
        barsToAdvance: 10,
      });
      assert.ok(result.totalTrades !== undefined);
      assert.ok(result.cumulativePnlBps !== undefined);
    });

    it("executeTrade with different strategies", async () => {
      const r1 = await callTool("executeTrade", { strategy: "FadeTrader", barsToAdvance: 10 });
      assert.ok(r1.cumulativePnlBps !== undefined);

      const r2 = await callTool("executeTrade", { strategy: "GridRunner", barsToAdvance: 10 });
      assert.ok(r2.cumulativePnlBps !== undefined);
    });

    it("submitResult records final PnL on-chain", async () => {
      const result = await callTool("submitResult");
      assert.equal(result.success, true);
      assert.ok(result.finalPnlBps !== undefined);
      assert.ok(result.txSignature);
    });

    it("getEnrollment shows result after submission", async () => {
      const result = await callTool("getEnrollment");
      assert.ok(result.status !== "Active"); // Should be Passed or Failed*
      assert.ok(result.finalPnlBps !== undefined);
    });

    it("updateAgentStats records competition stats on-chain", async () => {
      const result = await callTool("updateAgentStats");
      assert.equal(result.success, true);
      assert.ok(result.tradeCount !== undefined);
      assert.ok(result.txSignature);
    });

    it("getAgentInfo shows updated stats", async () => {
      const result = await callTool("getAgentInfo");
      assert.ok(Number(result.totalTrades) > 0);
      assert.equal(result.competitionsEntered, 1);
    });
  });

  // ── Tool registry ───────────────────────────────────────────────────

  describe("tool registry", () => {
    it("has all tools registered", () => {
      assert.ok(tools.length >= 10, `Expected 10+ tools, got ${tools.length}`);
    });

    it("all tools have name, description, and execute", () => {
      for (const tool of tools) {
        assert.ok(tool.name, "tool missing name");
        assert.ok(tool.description, `${tool.name} missing description`);
        assert.ok(typeof tool.execute === "function", `${tool.name} missing execute`);
        assert.ok(tool.parameters, `${tool.name} missing parameters`);
      }
    });

    it("tool names are unique", () => {
      const names = tools.map((t) => t.name);
      assert.equal(new Set(names).size, names.length);
    });

    it("tracks tx signatures across calls", () => {
      assert.ok(ctx.txSignatures.length >= 5, `Expected 5+ txs, got ${ctx.txSignatures.length}`);
    });
  });
});
