import { authenticateAgent } from "@/lib/agent/auth";
import { checkAgentRateLimit } from "@/lib/agent/rate-limit";
import {
  createAgentTools,
  rateLimitTierForTool,
  type AgentToolName,
} from "@/lib/agent/tools";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  // ── Auth ──────────────────────────────────────────────────────────────
  const auth = await authenticateAgent(request.headers.get("authorization"));
  if (!auth) {
    return NextResponse.json(
      { error: "Invalid or missing API key." },
      { status: 401 }
    );
  }

  // ── Parse body ────────────────────────────────────────────────────────
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { tool: toolName, params } = body as {
    tool?: string;
    params?: Record<string, unknown>;
  };

  if (!toolName) {
    return NextResponse.json(
      { error: 'Missing "tool" field in request body.' },
      { status: 400 }
    );
  }

  // ── Build wallet-scoped tools ─────────────────────────────────────────
  const tools = createAgentTools(auth.wallet);

  if (!(toolName in tools)) {
    return NextResponse.json(
      {
        error: `Unknown tool "${toolName}". Available: ${Object.keys(tools).join(", ")}`,
      },
      { status: 400 }
    );
  }

  // ── Rate limit ────────────────────────────────────────────────────────
  const tier = rateLimitTierForTool(toolName);
  const limit = checkAgentRateLimit(auth.keyId, tier);
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

  // ── Execute tool ──────────────────────────────────────────────────────
  try {
    const selectedTool = tools[toolName as AgentToolName];
    if (!selectedTool.execute) {
      return NextResponse.json(
        { error: `Tool "${toolName}" has no execute function.` },
        { status: 500 }
      );
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await selectedTool.execute(params ?? ({} as any), {
      toolCallId: `exec_${Date.now()}`,
      messages: [],
    });
    return NextResponse.json({ result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
