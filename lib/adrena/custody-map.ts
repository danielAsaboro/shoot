/**
 * Maps Adrena custody mint pubkeys to market symbols and asset classes.
 * Used for specialist track enforcement (e.g., Metals Track = only XAU/XAG).
 *
 * These are the known custody mints from the Adrena program on mainnet.
 * pool_type 0 = Token pool (crypto), pool_type 1 = Synthetic pool (RWA).
 */

export type AssetClass = "crypto" | "metals" | "energy" | "forex";

export interface MarketInfo {
  market: string;
  assetClass: AssetClass;
}

// Token pool custodies (pool_type = 0)
const TOKEN_POOL_CUSTODIES: Record<string, MarketInfo> = {
  // SOL
  So11111111111111111111111111111111: { market: "SOL", assetClass: "crypto" },
  // BTC (wBTC)
  "3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh": {
    market: "BTC",
    assetClass: "crypto",
  },
  // BONK
  DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263: {
    market: "BONK",
    assetClass: "crypto",
  },
  // jitoSOL
  J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn: {
    market: "jitoSOL",
    assetClass: "crypto",
  },
  // ETH (wETH)
  "7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs": {
    market: "ETH",
    assetClass: "crypto",
  },
  // USDC (collateral)
  EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: {
    market: "USDC",
    assetClass: "crypto",
  },
};

// Synthetic pool custodies will be added when the commodities pool launches.
// For now, any unknown mint with pool_type=1 is treated as RWA.
const SYNTHETIC_POOL_CUSTODIES: Record<string, MarketInfo> = {
  // Not yet available on mainnet. Populated when Adrena announces synthetic custody mints.
};

/**
 * Look up market info for a custody mint.
 * Returns null for unknown custodies (logs a warning).
 */
export function getMarketInfo(
  custodyMint: string,
  poolType?: number
): MarketInfo | null {
  const tokenMatch = TOKEN_POOL_CUSTODIES[custodyMint];
  if (tokenMatch) return tokenMatch;

  const syntheticMatch = SYNTHETIC_POOL_CUSTODIES[custodyMint];
  if (syntheticMatch) return syntheticMatch;

  // If pool_type is synthetic (1) but mint is unknown, classify generically
  if (poolType === 1) {
    console.warn(
      `[custody-map] Unknown synthetic custody mint: ${custodyMint}`
    );
    return { market: "UNKNOWN_RWA", assetClass: "metals" };
  }

  console.warn(`[custody-map] Unknown custody mint: ${custodyMint}`);
  return null;
}

/**
 * Check if a custody mint is allowed for a given set of allowed markets.
 */
export function isCustodyAllowed(
  custodyMint: string,
  allowedMarkets: string[],
  poolType?: number
): boolean {
  const info = getMarketInfo(custodyMint, poolType);
  if (!info) return true; // Unknown custodies are not blocked (fail open)
  return (
    allowedMarkets.includes(info.market) ||
    allowedMarkets.includes(info.assetClass)
  );
}
