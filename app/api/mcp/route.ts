import { z } from "zod";
import { createMcpHandler, withMcpAuth } from "mcp-handler";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { authenticateAgent } from "@/lib/agent/auth";
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
} from "@/lib/adrena/client";
import {
  getActiveCohorts,
  getLeaderboard,
  getEnrollmentsByWallet,
} from "@/lib/db/queries";

// ── MCP handler (all 12 tools, wallet injected from API key auth) ────────────

const handler = createMcpHandler(
  (server) => {
    // ── Read tools ─────────────────────────────────────────────────────────

    server.tool(
      "getPositions",
      "Fetch open and historical trading positions for your wallet on Adrena.",
      {
        limit: z
          .number()
          .int()
          .min(1)
          .max(500)
          .default(100)
          .describe("Max positions to return"),
      },
      async ({ limit }, { authInfo }) => {
        const wallet = (authInfo?.extra as { wallet: string })?.wallet;
        if (!wallet) return err("Not authenticated");
        const positions = await fetchPositions(wallet, limit);
        return ok({ positions });
      }
    );

    server.tool(
      "getPoolStats",
      "Get aggregated Adrena pool statistics: daily/total volume, fees, and pool name.",
      {
        endDate: z
          .string()
          .optional()
          .describe("End date filter (YYYY-MM-DD)"),
      },
      async ({ endDate }) => {
        const stats = await fetchPoolStats(
          endDate ? { end_date: endDate } : {}
        );
        return ok(stats);
      }
    );

    server.tool(
      "getLiquidityInfo",
      "Get real-time per-custody liquidity breakdown: TVL, utilization, target ratios.",
      {},
      async () => {
        const info = await fetchLiquidityInfo();
        return ok(info);
      }
    );

    server.tool(
      "getLeaderboard",
      "Get competition leaderboard standings for a specific cohort, ranked by tournament score.",
      {
        cohortId: z.string().describe("The competition cohort ID"),
      },
      async ({ cohortId }) => {
        const standings = await getLeaderboard(cohortId);
        return ok({ standings });
      }
    );

    server.tool(
      "getActiveCohorts",
      "List all live and upcoming trading competitions you can join.",
      {},
      async () => {
        const cohorts = await getActiveCohorts();
        return ok({ cohorts });
      }
    );

    server.tool(
      "getMyEnrollments",
      "List all competitions your wallet is enrolled in.",
      {},
      async (_, { authInfo }) => {
        const wallet = (authInfo?.extra as { wallet: string })?.wallet;
        if (!wallet) return err("Not authenticated");
        const enrollments = await getEnrollmentsByWallet(wallet);
        return ok({ enrollments });
      }
    );

    // ── Trading tools (return unsigned transactions) ──────────────────────

    server.tool(
      "openLong",
      "Generate an unsigned Solana transaction to open a leveraged long position on Adrena. The transaction must be signed and submitted by the caller.",
      {
        collateralAmount: z
          .number()
          .positive()
          .describe("Collateral amount in token units"),
        collateralTokenSymbol: z
          .string()
          .describe("Collateral token: USDC"),
        tokenSymbol: z
          .string()
          .describe("Market to trade: BONK, JITOSOL, or WBTC"),
        leverage: z
          .number()
          .min(1.1)
          .max(100)
          .describe("Leverage multiplier (1.1–100)"),
        takeProfit: z.number().positive().optional().describe("Take profit price"),
        stopLoss: z.number().positive().optional().describe("Stop loss price"),
      },
      async (params, { authInfo }) => {
        const wallet = (authInfo?.extra as { wallet: string })?.wallet;
        if (!wallet) return err("Not authenticated");
        const result = await fetchOpenLong({ account: wallet, ...params });
        return ok({ requiresSignature: true, ...result });
      }
    );

    server.tool(
      "openShort",
      "Generate an unsigned Solana transaction to open a leveraged short position on Adrena. The transaction must be signed and submitted by the caller.",
      {
        collateralAmount: z
          .number()
          .positive()
          .describe("Collateral amount in token units"),
        collateralTokenSymbol: z
          .string()
          .describe("Collateral token: USDC"),
        tokenSymbol: z
          .string()
          .describe("Market to trade: BONK, JITOSOL, or WBTC"),
        leverage: z
          .number()
          .min(1.1)
          .max(100)
          .describe("Leverage multiplier (1.1–100)"),
        takeProfit: z.number().positive().optional().describe("Take profit price"),
        stopLoss: z.number().positive().optional().describe("Stop loss price"),
      },
      async (params, { authInfo }) => {
        const wallet = (authInfo?.extra as { wallet: string })?.wallet;
        if (!wallet) return err("Not authenticated");
        const result = await fetchOpenShort({ account: wallet, ...params });
        return ok({ requiresSignature: true, ...result });
      }
    );

    server.tool(
      "closeLong",
      "Generate an unsigned Solana transaction to close (fully or partially) a long position on Adrena.",
      {
        collateralTokenSymbol: z
          .string()
          .describe("Collateral token symbol of the position"),
        tokenSymbol: z.string().describe("Market token symbol of the position"),
        percentage: z
          .number()
          .min(1)
          .max(100)
          .optional()
          .describe("Percentage of position to close (default: 100)"),
      },
      async (params, { authInfo }) => {
        const wallet = (authInfo?.extra as { wallet: string })?.wallet;
        if (!wallet) return err("Not authenticated");
        const result = await fetchCloseLong({ account: wallet, ...params });
        return ok({ requiresSignature: true, ...result });
      }
    );

    server.tool(
      "closeShort",
      "Generate an unsigned Solana transaction to close (fully or partially) a short position on Adrena.",
      {
        collateralTokenSymbol: z
          .string()
          .describe("Collateral token symbol of the position"),
        tokenSymbol: z.string().describe("Market token symbol of the position"),
        percentage: z
          .number()
          .min(1)
          .max(100)
          .optional()
          .describe("Percentage of position to close (default: 100)"),
      },
      async (params, { authInfo }) => {
        const wallet = (authInfo?.extra as { wallet: string })?.wallet;
        if (!wallet) return err("Not authenticated");
        const result = await fetchCloseShort({ account: wallet, ...params });
        return ok({ requiresSignature: true, ...result });
      }
    );

    server.tool(
      "openLimitLong",
      "Generate an unsigned Solana transaction to place a limit order for a long position. Executes when the market hits your trigger price.",
      {
        collateralAmount: z.number().positive().describe("Collateral amount"),
        collateralTokenSymbol: z.string().describe("Collateral token symbol"),
        tokenSymbol: z.string().describe("Market token symbol"),
        leverage: z
          .number()
          .min(1.1)
          .max(100)
          .describe("Leverage multiplier (1.1–100)"),
        triggerPrice: z
          .number()
          .positive()
          .describe("Price at which the order triggers"),
        limitPrice: z
          .number()
          .positive()
          .optional()
          .describe("Maximum execution price"),
      },
      async (params, { authInfo }) => {
        const wallet = (authInfo?.extra as { wallet: string })?.wallet;
        if (!wallet) return err("Not authenticated");
        const result = await fetchOpenLimitLong({ account: wallet, ...params });
        return ok({ requiresSignature: true, ...result });
      }
    );

    server.tool(
      "openLimitShort",
      "Generate an unsigned Solana transaction to place a limit order for a short position. Executes when the market hits your trigger price.",
      {
        collateralAmount: z.number().positive().describe("Collateral amount"),
        collateralTokenSymbol: z.string().describe("Collateral token symbol"),
        tokenSymbol: z.string().describe("Market token symbol"),
        leverage: z
          .number()
          .min(1.1)
          .max(100)
          .describe("Leverage multiplier (1.1–100)"),
        triggerPrice: z
          .number()
          .positive()
          .describe("Price at which the order triggers"),
        limitPrice: z
          .number()
          .positive()
          .optional()
          .describe("Minimum execution price"),
      },
      async (params, { authInfo }) => {
        const wallet = (authInfo?.extra as { wallet: string })?.wallet;
        if (!wallet) return err("Not authenticated");
        const result = await fetchOpenLimitShort({
          account: wallet,
          ...params,
        });
        return ok({ requiresSignature: true, ...result });
      }
    );
  },
  {},
  { basePath: "/api" }
);

// ── Auth: verify Shoot API keys (shoot_ak_...) ────────────────────────────

const verifyToken = async (
  req: Request,
  bearerToken?: string
): Promise<AuthInfo | undefined> => {
  if (!bearerToken) return undefined;
  const authResult = await authenticateAgent(`Bearer ${bearerToken}`);
  if (!authResult) return undefined;
  return {
    token: bearerToken,
    scopes: ["trading"],
    clientId: authResult.keyId,
    extra: { wallet: authResult.wallet },
  };
};

const authHandler = withMcpAuth(handler, verifyToken, {
  required: true,
  requiredScopes: ["trading"],
  resourceMetadataPath: "/.well-known/oauth-protected-resource",
});

export { authHandler as GET, authHandler as POST, authHandler as DELETE };

// ── Helpers ───────────────────────────────────────────────────────────────

function ok(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data) }] };
}

function err(message: string) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify({ error: message }) }],
    isError: true,
  };
}
