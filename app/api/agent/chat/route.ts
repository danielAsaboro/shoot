import { streamText, stepCountIs } from "ai";
import { openai } from "@ai-sdk/openai";
import { authenticateAgent } from "@/lib/agent/auth";
import { checkAgentRateLimit } from "@/lib/agent/rate-limit";
import { createAgentTools } from "@/lib/agent/tools";
import { NextRequest, NextResponse } from "next/server";

const SYSTEM_PROMPT = `You are an Adrena trading agent assistant. You help traders interact with the Adrena perpetuals protocol on Solana.

Available markets: SOL, BTC, ETH, BONK, XAU (Gold), XAG (Silver), EUR, GBP.
Collateral tokens: USDC, SOL, JITOSOLAND.

You have tools to:
- Query positions, pool stats, liquidity info
- Check competition leaderboards and active competitions
- Open/close leveraged long and short positions
- Place limit orders

IMPORTANT: Trading tools return unsigned transactions. The caller must sign and submit them to Solana. Always remind the user of this when they execute a trade.

When a user asks to trade, confirm the details (token, size, leverage, direction) before calling the tool. Be concise and direct.`;

export async function POST(request: NextRequest) {
  // ── Auth ──────────────────────────────────────────────────────────────
  const auth = await authenticateAgent(request.headers.get("authorization"));
  if (!auth) {
    return NextResponse.json(
      { error: "Invalid or missing API key." },
      { status: 401 }
    );
  }

  // ── Rate limit (chat uses "read" tier) ────────────────────────────────
  const limit = checkAgentRateLimit(auth.keyId, "read");
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded." },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil(limit.retryAfterMs / 1000)),
        },
      }
    );
  }

  // ── Parse messages ────────────────────────────────────────────────────
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { messages } = body as {
    messages?: Array<{ role: "user" | "assistant"; content: string }>;
  };

  if (!messages || !Array.isArray(messages)) {
    return NextResponse.json(
      { error: '"messages" array is required.' },
      { status: 400 }
    );
  }

  // ── Stream with tools ─────────────────────────────────────────────────
  const tools = createAgentTools(auth.wallet);

  const result = streamText({
    model: openai("gpt-4o"),
    system: SYSTEM_PROMPT,
    messages,
    tools,
    stopWhen: stepCountIs(5),
  });

  return result.toUIMessageStreamResponse();
}
