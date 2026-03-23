# Agent Tool Schemas

Complete parameter schemas for all 12 production tools. Defined in `lib/agent/tools.ts`.

All tools are wallet-scoped: `createAgentTools(wallet: string)` injects the authenticated wallet into every tool call. The wallet comes from the API key, not from request parameters.

## Rate Limit Classification

```typescript
const TRADE_TOOLS = new Set([
  "openLong", "openShort", "closeLong", "closeShort",
  "openLimitLong", "openLimitShort",
]);

// Everything else is "read" tier (60/min). Trade tools get 10/min.
function rateLimitTierForTool(name: string): "read" | "trade" {
  return TRADE_TOOLS.has(name) ? "trade" : "read";
}
```

---

## Read Tools

### getPositions

Fetch open and historical trading positions for your wallet on Adrena.

```typescript
inputSchema: z.object({
  limit: z.number().int().min(1).max(500).default(100)
    .describe("Max positions to return"),
})
```

**Returns:** `{ positions: AdrenaPosition[] }`
**Calls:** `fetchPositions(wallet, limit)` from `lib/adrena/client.ts`

### getPoolStats

Get aggregated Adrena pool statistics: daily/total volume, fees, and pool name.

```typescript
inputSchema: z.object({
  endDate: z.string().optional()
    .describe("End date filter (YYYY-MM-DD)"),
})
```

**Returns:** `AdrenaPoolStats` (volume, fees, pool name)
**Calls:** `fetchPoolStats({ end_date })` from `lib/adrena/client.ts`

### getLiquidityInfo

Get real-time per-custody liquidity breakdown: TVL, utilization, target ratios.

```typescript
inputSchema: z.object({})
```

**Returns:** `AdrenaLiquidityInfo` (array of custodies with TVL, utilization %, target ratios)
**Calls:** `fetchLiquidityInfo()` from `lib/adrena/client.ts`

### getLeaderboard

Get competition leaderboard standings for a specific cohort, ranked by tournament score.

```typescript
inputSchema: z.object({
  cohortId: z.string().describe("The competition cohort ID"),
})
```

**Returns:** `{ standings: TraderScore[] }`
**Calls:** `getLeaderboard(cohortId)` from `lib/db/queries.ts`

### getActiveCohorts

List all live and upcoming trading competitions you can join.

```typescript
inputSchema: z.object({})
```

**Returns:** `{ cohorts: Cohort[] }`
**Calls:** `getActiveCohorts()` from `lib/db/queries.ts`

### getMyEnrollments

List all competitions your wallet is enrolled in.

```typescript
inputSchema: z.object({})
```

**Returns:** `{ enrollments: Enrollment[] }`
**Calls:** `getEnrollmentsByWallet(wallet)` from `lib/db/queries.ts`

---

## Trade Tools

All trade tools return:
```typescript
{
  requiresSignature: true,
  quote: { /* pricing details */ },
  transaction: "<base64 encoded unsigned VersionedTransaction>"
}
```

### openLong

Generate an unsigned transaction to open a leveraged long position.

```typescript
inputSchema: z.object({
  collateralAmount: z.number().positive()
    .describe("Collateral amount in token units"),
  collateralTokenSymbol: z.string()
    .describe("Collateral token symbol (e.g. USDC, SOL)"),
  tokenSymbol: z.string()
    .describe("Market to trade (e.g. SOL, BTC, ETH, BONK)"),
  leverage: z.number().min(1.1).max(100)
    .describe("Leverage multiplier"),
  takeProfit: z.number().positive().optional()
    .describe("Take profit price (optional)"),
  stopLoss: z.number().positive().optional()
    .describe("Stop loss price (optional)"),
})
```

**Calls:** `fetchOpenLong({ account: wallet, ...params })`

### openShort

Same schema as openLong. Generates unsigned short position transaction.

**Calls:** `fetchOpenShort({ account: wallet, ...params })`

### closeLong

Generate an unsigned transaction to close (fully or partially) a long position.

```typescript
inputSchema: z.object({
  collateralTokenSymbol: z.string()
    .describe("Collateral token symbol of the position"),
  tokenSymbol: z.string()
    .describe("Market token symbol of the position"),
  percentage: z.number().min(1).max(100).optional()
    .describe("Percentage of position to close (default: 100)"),
})
```

**Calls:** `fetchCloseLong({ account: wallet, ...params })`

### closeShort

Same schema as closeLong. Generates unsigned close-short transaction.

**Calls:** `fetchCloseShort({ account: wallet, ...params })`

### openLimitLong

Generate an unsigned transaction to place a limit order for a long position.

```typescript
inputSchema: z.object({
  collateralAmount: z.number().positive()
    .describe("Collateral amount"),
  collateralTokenSymbol: z.string()
    .describe("Collateral token symbol"),
  tokenSymbol: z.string()
    .describe("Market token symbol"),
  leverage: z.number().min(1.1).max(100)
    .describe("Leverage multiplier"),
  triggerPrice: z.number().positive()
    .describe("Price at which the order triggers"),
  limitPrice: z.number().positive().optional()
    .describe("Maximum execution price (optional)"),
})
```

**Calls:** `fetchOpenLimitLong({ account: wallet, ...params })`

### openLimitShort

Same schema as openLimitLong. `limitPrice` is the minimum execution price.

**Calls:** `fetchOpenLimitShort({ account: wallet, ...params })`

---

## Adrena Data API Endpoints

All trading tools call `lib/adrena/client.ts` which hits `https://datapi.adrena.trade`:

| Tool | API Path |
|------|----------|
| openLong | `/open-long?account=...&collateralAmount=...&leverage=...` |
| openShort | `/open-short?account=...&collateralAmount=...&leverage=...` |
| closeLong | `/close-long?account=...&tokenSymbol=...&percentage=...` |
| closeShort | `/close-short?account=...&tokenSymbol=...&percentage=...` |
| openLimitLong | `/open-limit-long?account=...&triggerPrice=...` |
| openLimitShort | `/open-limit-short?account=...&triggerPrice=...` |
| getPositions | `/position?user_wallet=...&limit=...` |
| getPoolStats | `/pool-high-level-stats?end_date=...&pool_name=...` |
| getLiquidityInfo | `/liquidity-info` |

Response envelope: `{ success: boolean, error: string | null, data: T }`
