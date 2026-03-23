#!/usr/bin/env npx tsx
/**
 * Reasoning Agent vs Surfpool
 *
 * An AI agent (GPT-4o) that autonomously:
 *   1. Discovers available tools
 *   2. Reasons about what to do step-by-step
 *   3. Calls tools to read state, analyze markets, execute trades
 *   4. Submits on-chain transactions to Surfpool
 *
 * Usage:
 *   # Terminal 1: start Surfpool
 *   cd programs/shoot && surfpool start --no-tui --yes --offline
 *
 *   # Terminal 2: run the reasoning agent
 *   npx tsx scripts/agent-chat-surfpool.ts
 */

import "dotenv/config";
import OpenAI from "openai";
import {
  Connection,
  Keypair,
  PublicKey,
} from "@solana/web3.js";
import {
  createSurfpoolTools,
  toolsToOpenAIFunctions,
  generateInitialBars,
  findAta,
  surfnetRpc,
  type AgentContext,
  type ToolDefinition,
} from "../lib/agent/surfpool-tools.ts";

// ── Config ──────────────────────────────────────────────────────────────────

const SURFPOOL_URL = process.env.SURFPOOL_URL ?? "http://localhost:8899";
const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const MAX_TURNS = 25; // Max agent reasoning turns

// ── Setup ───────────────────────────────────────────────────────────────────

async function setAccount(
  rpcUrl: string,
  pubkey: PublicKey,
  opts: { lamports?: number; data?: Buffer; owner?: PublicKey }
): Promise<void> {
  const params: Record<string, unknown> = {};
  if (opts.lamports !== undefined) params.lamports = opts.lamports;
  if (opts.data !== undefined) params.data = opts.data.toString("hex");
  if (opts.owner !== undefined) params.owner = opts.owner.toBase58();
  await surfnetRpc(rpcUrl, "surfnet_setAccount", [pubkey.toBase58(), params]);
}

async function setupSurfpoolState(ctx: AgentContext): Promise<void> {
  // Fund all actors
  await setAccount(ctx.rpcUrl, ctx.agentKeypair.publicKey, { lamports: 100_000_000_000 });
  await setAccount(ctx.rpcUrl, ctx.adminKeypair.publicKey, { lamports: 100_000_000_000 });
  await setAccount(ctx.rpcUrl, ctx.resultAuthorityKeypair.publicKey, { lamports: 100_000_000_000 });

  // Create USDC mint
  const mintData = Buffer.alloc(82);
  mintData.writeUInt32LE(1, 0);
  ctx.adminKeypair.publicKey.toBuffer().copy(mintData, 4);
  mintData.writeBigUInt64LE(BigInt(1_000_000_000_000), 36);
  mintData.writeUInt8(6, 44);
  mintData.writeUInt8(1, 45);
  await setAccount(ctx.rpcUrl, ctx.usdcMint, { data: mintData, lamports: 1_000_000_000, owner: TOKEN_PROGRAM_ID });

  // Create agent USDC token account (100 USDC)
  const ata = findAta(ctx.agentKeypair.publicKey, ctx.usdcMint);
  const tokenData = Buffer.alloc(165);
  ctx.usdcMint.toBuffer().copy(tokenData, 0);
  ctx.agentKeypair.publicKey.toBuffer().copy(tokenData, 32);
  tokenData.writeBigUInt64LE(BigInt(100_000_000), 64);
  tokenData.writeUInt8(1, 108);
  await setAccount(ctx.rpcUrl, ata, { data: tokenData, lamports: 2_039_280, owner: TOKEN_PROGRAM_ID });
}

// ── System prompt ───────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are an autonomous trading agent competing in the Adrena Shoot prop trading challenge on Solana.

Your goal: Register yourself, create a competition, enroll, trade using technical analysis, then submit your results on-chain.

You have access to tools that let you:
- Read on-chain state (balances, challenges, enrollments, agent info)
- Analyze market data with 5 different trading strategies
- Execute trades and track PnL
- Submit competition results on-chain

## Strategy
1. First check your balance and available tools
2. Register as an agent with a strategy name
3. Create a challenge (Scout tier, 8% profit target, 5% max drawdown)
4. Enroll in the challenge
5. Analyze the market with multiple strategies to find the best signal
6. Execute trades when you see strong conviction signals
7. Keep trading until you've made several trades
8. Submit your result and update your stats

## Rules
- You must execute at least 3 trades before submitting results
- Use analyzeMarket with different strategies to compare signals
- When a strategy shows "buy" or "sell" with high conviction, execute the trade
- After each trade, check the result and decide whether to continue
- Be aggressive — you need 800 bps (8%) profit to pass the challenge

Think step by step. Explain your reasoning before each tool call.`;

// ── Main agent loop ─────────────────────────────────────────────────────────

async function main() {
  // Validate OpenAI key
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error("Missing OPENAI_API_KEY in .env");
    process.exit(1);
  }
  const openai = new OpenAI({ apiKey });

  console.log("╔═══════════════════════════════════════════════════════════╗");
  console.log("║   REASONING AGENT — GPT-4o + Surfpool                    ║");
  console.log("╚═══════════════════════════════════════════════════════════╝");
  console.log();

  // Verify Surfpool
  const connection = new Connection(SURFPOOL_URL, "confirmed");
  try {
    await connection.getSlot();
    console.log("✓ Surfpool running at", SURFPOOL_URL);
  } catch {
    console.error("✗ Surfpool not reachable. Start with:");
    console.error("  cd programs/shoot && surfpool start --no-tui --yes --offline");
    process.exit(1);
  }

  // Create context
  const ctx: AgentContext = {
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

  console.log("  Agent wallet:", ctx.agentKeypair.publicKey.toBase58());
  console.log();

  // Setup Surfpool state
  await setupSurfpoolState(ctx);
  console.log("✓ Surfpool state initialized (accounts funded, USDC created)");
  console.log();

  // Create tools
  const tools = createSurfpoolTools();
  const toolMap = new Map(tools.map((t) => [t.name, t]));
  const openAITools = toolsToOpenAIFunctions(tools);

  // Start conversation
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content:
        "You are now live on Surfpool (local Solana validator). Begin your autonomous trading run. Start by checking your balance, then register as an agent, create a challenge, and trade. Go!",
    },
  ];

  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  AGENT REASONING LOOP");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log();

  for (let turn = 1; turn <= MAX_TURNS; turn++) {
    console.log(`── Turn ${turn}/${MAX_TURNS} ──────────────────────────────────────────`);

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages,
      tools: openAITools,
      tool_choice: "auto",
    });

    const message = response.choices[0].message;
    messages.push(message);

    // Print reasoning
    if (message.content) {
      console.log();
      console.log("🤖 Agent:", message.content);
      console.log();
    }

    // If no tool calls, agent is done reasoning
    if (!message.tool_calls || message.tool_calls.length === 0) {
      console.log("  (Agent finished — no more tool calls)");
      break;
    }

    // Execute tool calls
    for (const toolCall of message.tool_calls) {
      const toolName = toolCall.function.name;
      const toolArgs = JSON.parse(toolCall.function.arguments || "{}");
      const tool = toolMap.get(toolName);

      console.log(`  📞 Calling: ${toolName}(${JSON.stringify(toolArgs)})`);

      let result: string;
      if (!tool) {
        result = JSON.stringify({ error: `Unknown tool: ${toolName}` });
      } else {
        try {
          result = await tool.execute(ctx, toolArgs);
        } catch (err) {
          result = JSON.stringify({
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      // Print result (truncated)
      const preview =
        result.length > 200 ? result.slice(0, 200) + "..." : result;
      console.log(`  📋 Result: ${preview}`);
      console.log();

      messages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content: result,
      });
    }
  }

  // Final summary
  console.log();
  console.log("╔═══════════════════════════════════════════════════════════╗");
  console.log("║                 AGENT RUN SUMMARY                         ║");
  console.log("╠═══════════════════════════════════════════════════════════╣");
  console.log(`║  Trades executed: ${ctx.tradeCount}`);
  console.log(`║  Final PnL:      ${ctx.totalPnlBps > 0 ? "+" : ""}${ctx.totalPnlBps} bps (${(ctx.totalPnlBps / 100).toFixed(1)}%)`);
  console.log(`║  Max Drawdown:   ${Math.abs(ctx.maxDrawdownBps)} bps`);
  console.log(`║  On-chain txs:   ${ctx.txSignatures.length}`);
  console.log(`║  Result:         ${ctx.totalPnlBps >= 800 ? "PASSED ✓" : "FAILED ✗"}`);
  console.log("╚═══════════════════════════════════════════════════════════╝");
}

main().catch((err) => {
  console.error("\nFatal error:", err);
  process.exit(1);
});
