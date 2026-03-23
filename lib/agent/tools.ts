import { tool } from "ai";
import { z } from "zod";
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
import type { RateLimitTier } from "./rate-limit";

// ── Tool metadata (used by execute endpoint for rate limiting) ───────────────

export const TRADE_TOOLS = new Set([
  "openLong",
  "openShort",
  "closeLong",
  "closeShort",
  "openLimitLong",
  "openLimitShort",
]);

export function rateLimitTierForTool(name: string): RateLimitTier {
  return TRADE_TOOLS.has(name) ? "trade" : "read";
}

// ── Tool factory: creates wallet-scoped tools ────────────────────────────────

export function createAgentTools(wallet: string) {
  return {
    // ── Read tools ─────────────────────────────────────────────────────

    getPositions: tool({
      description:
        "Fetch open and historical trading positions for your wallet on Adrena.",
      inputSchema: z.object({
        limit: z
          .number()
          .int()
          .min(1)
          .max(500)
          .default(100)
          .describe("Max positions to return"),
      }),
      execute: async ({ limit }) => {
        const positions = await fetchPositions(wallet, limit);
        return { positions };
      },
    }),

    getPoolStats: tool({
      description:
        "Get aggregated Adrena pool statistics: daily/total volume, fees, and pool name.",
      inputSchema: z.object({
        endDate: z.string().optional().describe("End date filter (YYYY-MM-DD)"),
      }),
      execute: async ({ endDate }) => {
        const stats = await fetchPoolStats(
          endDate ? { end_date: endDate } : {}
        );
        return stats;
      },
    }),

    getLiquidityInfo: tool({
      description:
        "Get real-time per-custody liquidity breakdown: TVL, utilization, target ratios.",
      inputSchema: z.object({}),
      execute: async () => {
        const info = await fetchLiquidityInfo();
        return info;
      },
    }),

    getLeaderboard: tool({
      description:
        "Get competition leaderboard standings for a specific cohort, ranked by tournament score.",
      inputSchema: z.object({
        cohortId: z.string().describe("The competition cohort ID"),
      }),
      execute: async ({ cohortId }) => {
        const standings = await getLeaderboard(cohortId);
        return { standings };
      },
    }),

    getActiveCohorts: tool({
      description:
        "List all live and upcoming trading competitions you can join.",
      inputSchema: z.object({}),
      execute: async () => {
        const cohorts = await getActiveCohorts();
        return { cohorts };
      },
    }),

    getMyEnrollments: tool({
      description: "List all competitions your wallet is enrolled in.",
      inputSchema: z.object({}),
      execute: async () => {
        const enrollments = await getEnrollmentsByWallet(wallet);
        return { enrollments };
      },
    }),

    // ── Trading tools (return unsigned transactions) ───────────────────

    openLong: tool({
      description:
        "Generate an unsigned transaction to open a leveraged long position on Adrena. You must sign and submit the returned transaction.",
      inputSchema: z.object({
        collateralAmount: z
          .number()
          .positive()
          .describe("Collateral amount in token units"),
        collateralTokenSymbol: z
          .string()
          .describe("Collateral token symbol (e.g. USDC, SOL)"),
        tokenSymbol: z
          .string()
          .describe("Market to trade (e.g. SOL, BTC, ETH, BONK)"),
        leverage: z.number().min(1.1).max(100).describe("Leverage multiplier"),
        takeProfit: z
          .number()
          .positive()
          .optional()
          .describe("Take profit price (optional)"),
        stopLoss: z
          .number()
          .positive()
          .optional()
          .describe("Stop loss price (optional)"),
      }),
      execute: async (params) => {
        const result = await fetchOpenLong({ account: wallet, ...params });
        return { requiresSignature: true, ...result };
      },
    }),

    openShort: tool({
      description:
        "Generate an unsigned transaction to open a leveraged short position on Adrena. You must sign and submit the returned transaction.",
      inputSchema: z.object({
        collateralAmount: z
          .number()
          .positive()
          .describe("Collateral amount in token units"),
        collateralTokenSymbol: z
          .string()
          .describe("Collateral token symbol (e.g. USDC)"),
        tokenSymbol: z
          .string()
          .describe("Market to trade (e.g. SOL, BTC, ETH, BONK)"),
        leverage: z.number().min(1.1).max(100).describe("Leverage multiplier"),
        takeProfit: z
          .number()
          .positive()
          .optional()
          .describe("Take profit price (optional)"),
        stopLoss: z
          .number()
          .positive()
          .optional()
          .describe("Stop loss price (optional)"),
      }),
      execute: async (params) => {
        const result = await fetchOpenShort({ account: wallet, ...params });
        return { requiresSignature: true, ...result };
      },
    }),

    closeLong: tool({
      description:
        "Generate an unsigned transaction to close (fully or partially) a long position. You must sign and submit the returned transaction.",
      inputSchema: z.object({
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
      }),
      execute: async (params) => {
        const result = await fetchCloseLong({ account: wallet, ...params });
        return { requiresSignature: true, ...result };
      },
    }),

    closeShort: tool({
      description:
        "Generate an unsigned transaction to close (fully or partially) a short position. You must sign and submit the returned transaction.",
      inputSchema: z.object({
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
      }),
      execute: async (params) => {
        const result = await fetchCloseShort({ account: wallet, ...params });
        return { requiresSignature: true, ...result };
      },
    }),

    openLimitLong: tool({
      description:
        "Generate an unsigned transaction to place a limit order for a long position. Executes when the market hits your trigger price.",
      inputSchema: z.object({
        collateralAmount: z.number().positive().describe("Collateral amount"),
        collateralTokenSymbol: z.string().describe("Collateral token symbol"),
        tokenSymbol: z.string().describe("Market token symbol"),
        leverage: z.number().min(1.1).max(100).describe("Leverage multiplier"),
        triggerPrice: z
          .number()
          .positive()
          .describe("Price at which the order triggers"),
        limitPrice: z
          .number()
          .positive()
          .optional()
          .describe("Maximum execution price (optional)"),
      }),
      execute: async (params) => {
        const result = await fetchOpenLimitLong({ account: wallet, ...params });
        return { requiresSignature: true, ...result };
      },
    }),

    openLimitShort: tool({
      description:
        "Generate an unsigned transaction to place a limit order for a short position. Executes when the market hits your trigger price.",
      inputSchema: z.object({
        collateralAmount: z.number().positive().describe("Collateral amount"),
        collateralTokenSymbol: z.string().describe("Collateral token symbol"),
        tokenSymbol: z.string().describe("Market token symbol"),
        leverage: z.number().min(1.1).max(100).describe("Leverage multiplier"),
        triggerPrice: z
          .number()
          .positive()
          .describe("Price at which the order triggers"),
        limitPrice: z
          .number()
          .positive()
          .optional()
          .describe("Minimum execution price (optional)"),
      }),
      execute: async (params) => {
        const result = await fetchOpenLimitShort({
          account: wallet,
          ...params,
        });
        return { requiresSignature: true, ...result };
      },
    }),
  };
}

export type AgentTools = ReturnType<typeof createAgentTools>;
export type AgentToolName = keyof AgentTools;
