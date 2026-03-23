# Autopilot SDK Reference

Package: `@shoot/autopilot` in `sdk/`

Build with `cd sdk && npm run build`. Import from `sdk/dist/index.js`.

## Core Types

```typescript
/** OHLCV price bar */
interface Bar {
  ts: number;   // Unix timestamp (ms)
  o: number;    // Open
  h: number;    // High
  l: number;    // Low
  c: number;    // Close
  vol: number;  // Volume
}

/** Playbook decision output */
type Verdict =
  | { kind: "buy"; conviction: number; allocation: number }
  | { kind: "sell"; conviction: number; allocation: number }
  | { kind: "exit"; memo: string }
  | { kind: "pass" };
// conviction: 0.0-1.0 (signal strength)
// allocation: 0.0-1.0 (fraction of bankroll)

/** Active position */
interface Exposure {
  direction: "long" | "short";
  entry: number;
  size: number;
  floatingPnl: number;
  openedAt: number;
}

/** Risk constraints */
interface Guardrails {
  ceilingLeverage: number;   // Max leverage (default 5)
  maxExposureFrac: number;   // Max notional / bankroll (default 0.25)
  cutLossPct: number;        // Stop-loss (default 0.03 = 3%)
  lockGainPct: number;       // Take-profit (default 0.06 = 6%)
  pauseMs: number;           // Cooldown between trades (default 30000)
}

const DEFAULT_GUARDRAILS = {
  ceilingLeverage: 5,
  maxExposureFrac: 0.25,
  cutLossPct: 0.03,
  lockGainPct: 0.06,
  pauseMs: 30_000,
};

/** Strategy interface — all playbooks implement this */
interface Playbook {
  readonly label: string;
  readonly summary: string;
  assess(bars: Bar[], exposure: Exposure | null): Verdict;
}

interface FlightPlan {
  cadenceMs: number;  // Tick interval
  symbol: string;     // e.g. "SOL"
}

interface TradeParams {
  market: string;
  collateralAmount: number;
  leverage: number;
  slippage?: number;
}
```

---

## 5 Playbooks

### TrendSurfer — MACD Histogram Zero-Line Crossover

Not an EMA crossover. Uses histogram momentum.

```typescript
interface TrendSurferConfig {
  fastLen: number;    // default 12
  slowLen: number;    // default 26
  signalLen: number;  // default 9
}
```

| Signal | Condition |
|--------|-----------|
| Buy | Histogram crosses negative -> positive |
| Sell | Histogram crosses positive -> negative |
| Exit | Histogram crosses against position direction |
| Conviction | `min(1.0, max(0.3, |histogram| / maxHistogram))` |
| Allocation | `conviction * 0.5` |

Uses: `computeMACD()`

### FadeTrader — Keltner Channel + Stochastic

Counter-trend strategy fading extremes.

```typescript
interface FadeTraderConfig {
  keltnerPeriod: number;  // default 20
  atrMultiplier: number;  // default 2.0
  stochK: number;         // default 14
  stochD: number;         // default 3
  stochOB: number;        // default 80 (overbought)
  stochOS: number;        // default 20 (oversold)
}
```

| Signal | Condition |
|--------|-----------|
| Buy | Price < lower Keltner AND %K < oversold (20) |
| Sell | Price > upper Keltner AND %K > overbought (80) |
| Exit | Price returns to basis (within 20% of channel width) |
| Conviction | `(distBeyondChannel + stochExtreme) / 2` clamped 0.3-1.0 |
| Allocation | `conviction * 0.4` |

Uses: `computeKeltner()`, `computeStochastic()`

### RangeSniper — ATR Squeeze-Expansion + VWAP

Volatility regime change detector.

```typescript
interface RangeSniperConfig {
  atrPeriod: number;        // default 14
  contractionBars: number;  // default 5
  expansionMult: number;    // default 1.5
}
```

| Signal | Condition |
|--------|-----------|
| Entry | ATR contracts for N bars, then expands > 1.5x average |
| Direction | Long if price > VWAP, Short if price < VWAP |
| Exit | ATR contracts again OR price within 0.5 ATR of VWAP |
| Conviction | `min(1.0, max(0.3, expansionRatio / 3.0))` |
| Allocation | `conviction * 0.25` |

Uses: `computeATR()`, `computeVWAP()`

### FundingArb — Funding Rate Mean-Reversion

Unique to perpetual futures. Counter-trend strategy exploiting crowding imbalance.

```typescript
interface FundingArbConfig {
  fundingThreshold: number;  // default 0.01 (1%)
  exitThreshold: number;     // default 0.003 (0.3%)
  lookbackBars: number;      // default 20
}
```

Implied funding: `(currentPrice - avgRecentPrice) / avgRecentPrice`

| Signal | Condition |
|--------|-----------|
| Buy (long) | impliedFunding < -1% (shorts overcrowded) |
| Sell (short) | impliedFunding > 1% (longs overcrowded) |
| Exit | \|impliedFunding\| < 0.3% (normalized) |
| Conviction | `min(1.0, max(0.3, |funding| / threshold))` |
| Allocation | `conviction * 0.3` (conservative) |

No indicator dependencies.

### GridRunner — Dynamic ATR Grid Around VWAP

Stateful grid trading strategy.

```typescript
interface GridRunnerConfig {
  gridLevels: number;         // default 5
  atrPeriod: number;          // default 14
  gridSpacingAtrFrac: number; // default 0.5
}
```

Grid center = VWAP, spacing = ATR * 0.5, levels = +/- 5.

| Signal | Condition |
|--------|-----------|
| Buy | Price crossed to new level above center |
| Sell | Price crossed to new level below center |
| Exit | Price moved 2+ levels against position |
| Conviction | Fixed 0.6 |
| Allocation | Fixed 0.2 |

**Stateful:** Tracks `lastLevel` between `assess()` calls. Call `.reset()` between simulations.

Uses: `computeATR()`, `computeVWAP()`

---

## FlightController

The autonomous trading loop. Runs `tick()` every `cadenceMs` milliseconds.

```typescript
interface FlightControllerDeps {
  playbook: Playbook;
  harness: RiskHarness;
  feed: { getBars(symbol: string, limit: number): Promise<Bar[]> };
  execute: (verdict: Verdict) => Promise<void>;
}

class FlightController {
  constructor(plan: FlightPlan, deps: FlightControllerDeps)
  async tick(): Promise<Verdict>
  async start(): Promise<void>  // runs forever until stop()
  stop(): void
  getTickCount(): number
  isRunning(): boolean
}
```

**Tick lifecycle:**
1. `feed.getBars(symbol, 100)` — fetch price data
2. `harness.checkGuardrails(currentPrice)` — stop-loss / take-profit check
3. `playbook.assess(bars, exposure)` — get raw verdict
4. `harness.validate(verdict, currentPrice)` — enforce guardrails
5. If actionable: `await execute(verdict)` then update exposure

---

## RiskHarness

Enforces guardrails on every trade decision.

```typescript
class RiskHarness {
  constructor(guardrails: Guardrails, bankroll: number)
  getExposure(): Exposure | null
  getBankroll(): number
  validate(verdict: Verdict, currentPrice: number): Verdict
  checkGuardrails(currentPrice: number): Verdict
  openExposure(direction: "long"|"short", entry: number, size: number): void
  closeExposure(): void
}
```

**5 validation checks:**
1. Cooldown: `now - lastTradeTs < pauseMs` -> pass
2. Duplicate exposure: same direction as current position -> pass
3. Exposure fraction: `tradeNotional / bankroll > maxExposureFrac` -> pass
4. Leverage ceiling: implied leverage > `ceilingLeverage` -> pass
5. Stop-loss: PnL <= -`cutLossPct` -> exit
6. Take-profit: PnL >= `lockGainPct` -> exit

---

## Data Feeds

### OracleTap (Live)

Fetches from Pyth Hermes (`https://hermes.pyth.network`).

```typescript
class OracleTap {
  constructor(config: { symbols: Record<string, string>; cadenceMs: number })
  async getBars(symbol: string, limit: number): Promise<Bar[]>
}

// Built-in Pyth feed IDs:
const PYTH_FEED_IDS = {
  SOL:     "0xef0d8b6fda2ceba...",
  BTC:     "0xe62df6c8b4a85fe...",
  ETH:     "0xff61491a93111...",
  BONK:    "0x72b021217ca3fe...",
  JITOSOL: "0x67be9f519b95cf...",
};
```

Returns 1 bar (latest price as OHLCV). Not historical.

### ReplayTap (Testing)

Deterministic replay of pre-loaded bars.

```typescript
class ReplayTap {
  constructor(bars: Bar[])
  async getBars(symbol: string, limit: number): Promise<Bar[]>
  advance(): void     // move cursor forward 1 bar
  reset(): void       // reset to start
  getCursor(): number
}
```

---

## On-Chain Builders

### PerpBuilder

Builds Adrena perpetual trading instructions (stubs).

```typescript
class PerpBuilder {
  constructor(owner: PublicKey)
  buildOpenLongIx(params: TradeParams): TransactionInstruction
  buildOpenShortIx(params: TradeParams): TransactionInstruction
  buildCloseLongIx(params: TradeParams): TransactionInstruction
  buildCloseShortIx(params: TradeParams): TransactionInstruction
}
```

Program: `13gDzEXCdocbj8iAiqrScGo47NiSuYENGsRqi3SEAwet` (Adrena)
Pool: `5RhLNXTgVKii4azJSHVmGQYeEp2TbaE7Gw5W7Tq1DWor`

### ShootProgram

Builds Shoot program agent instructions.

```typescript
class ShootProgram {
  constructor(connection: Connection, payer: Keypair)
  async buildRegisterAgentIx(name: string, strategyHash: Uint8Array): Promise<TransactionInstruction>
}

function deriveAgentPda(owner: PublicKey): [PublicKey, number]
// Seeds: ["agent", owner, owner[0..8]]
```

Program: `4HVnwG8iz7wdUbEQDH8cYGD6EuxNmMuEbvCrz8Ke2iMG` (Shoot)

---

## Technical Indicators

All pure functions in `sdk/src/indicators/`.

| Function | Signature | Used By |
|----------|-----------|---------|
| `computeVWAP` | `(bars: Bar[]): number[]` | RangeSniper, GridRunner |
| `computeATR` | `(bars: Bar[], period: number): number[]` | RangeSniper, GridRunner, FadeTrader |
| `computeMACD` | `(closes: number[], fast, slow, signal): MacdResult` | TrendSurfer |
| `computeStochastic` | `(bars: Bar[], kPeriod, dPeriod): StochResult` | FadeTrader |
| `computeKeltner` | `(bars: Bar[], period, atrMult): KeltnerEnvelope` | FadeTrader |

Return types:
- `MacdResult: { line: number[], signal: number[], histogram: number[] }`
- `StochResult: { k: number[], d: number[] }`
- `KeltnerEnvelope: { upper: number[], basis: number[], lower: number[] }`
