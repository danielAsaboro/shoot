---
name: shoot-trading
description: >
  How to use the Adrena Shoot trading agent tools, API endpoints, and Autopilot SDK.
  Use this skill for ANY task involving Adrena trading, the Agent API, perpetual
  futures, opening/closing positions, limit orders, API key management, the
  Autopilot SDK, trading playbooks (TrendSurfer, FadeTrader, RangeSniper,
  FundingArb, GridRunner), FlightController, RiskHarness, competition enrollment,
  leaderboards, the Shoot on-chain program, or agent registration. Triggers on:
  trade, position, long, short, leverage, perp, agent API, autopilot, playbook,
  competition, leaderboard, Adrena, Shoot, API key, execute tool, market data,
  pool stats, liquidity, open long, open short, close position, limit order,
  unsigned transaction, sign and submit, PerpBuilder, ShootProgram, MACD,
  Keltner, grid trading, funding rate, SOL perpetuals, BTC perpetuals.
---

# Adrena Shoot Trading Skill

Production trading tools for the Adrena perpetuals protocol on Solana: Agent API, 12 tools, Autopilot SDK, and on-chain Shoot program.

## Quick Reference

| Item              | Value                                                    |
|-------------------|----------------------------------------------------------|
| **API Base**      | `/api/agent/chat`, `/api/agent/execute`, `/api/agent/keys` |
| **Auth**          | `Authorization: Bearer shoot_ak_<base64url>`             |
| **Markets**       | SOL, BTC, ETH, BONK, JITOSOL, XAU, XAG, EUR, GBP       |
| **Collateral**    | USDC, SOL                                                |
| **Rate Limits**   | Read: 60/min, Trade: 10/min (per API key)                |
| **Program ID**    | `4HVnwG8iz7wdUbEQDH8cYGD6EuxNmMuEbvCrz8Ke2iMG`         |
| **Adrena Data API** | `https://datapi.adrena.trade`                          |
| **MCP Server**    | `https://shoot-production-f218.up.railway.app/api/mcp` |

---

## Agent API Endpoints

### POST /api/agent/chat

Conversational agent with GPT-4o. All 12 tools available. Max 5 reasoning steps.

```json
// Request
{ "messages": [{ "role": "user", "content": "Open a 3x long on SOL with 50 USDC" }] }

// Response: SSE stream (Vercel AI SDK UI Message Stream Protocol)
```

### POST /api/agent/execute

Direct tool dispatch — no LLM reasoning. Faster for programmatic use.

```json
// Request
{ "tool": "openLong", "params": { "collateralAmount": 50, "collateralTokenSymbol": "USDC", "tokenSymbol": "SOL", "leverage": 3 } }

// Response
{ "result": { "requiresSignature": true, "quote": { ... }, "transaction": "<base64>" } }
```

### POST / GET / DELETE /api/agent/keys

Create, list, or revoke API keys. Creation requires an Ed25519 wallet signature.

---

## Authentication

1. Sign the challenge message with your wallet (Ed25519):
   ```
   shoot-agent-key-create:<unix_timestamp_ms>
   ```
2. POST to `/api/agent/keys`:
   ```json
   { "wallet": "<base58>", "signature": "<base58>", "timestamp": 1711234567890, "label": "my-bot" }
   ```
3. Receive the key (shown **once**):
   ```json
   { "id": "clxyz123", "key": "shoot_ak_T3cm6zZhEUUgsLdQv4pHqvZdy75ROxUyJYNviZ-B7GI" }
   ```
4. Use in all requests: `Authorization: Bearer shoot_ak_...`

Timestamp must be within 5 minutes. Keys are SHA-256 hashed server-side.

---

## 12 Tools

| Tool              | Type  | Rate  | Description                                               |
|-------------------|-------|-------|-----------------------------------------------------------|
| `getPositions`    | Read  | 60/m  | Fetch open/historical positions for your wallet           |
| `getPoolStats`    | Read  | 60/m  | Adrena pool volume, fees, TVL                             |
| `getLiquidityInfo` | Read | 60/m  | Per-custody liquidity: TVL, utilization, target ratios    |
| `getLeaderboard`  | Read  | 60/m  | Competition standings by cohort ID                        |
| `getActiveCohorts`| Read  | 60/m  | List live and upcoming competitions                       |
| `getMyEnrollments`| Read  | 60/m  | List competitions your wallet is enrolled in              |
| `openLong`        | Trade | 10/m  | Unsigned tx for leveraged long (1.1x-100x)               |
| `openShort`       | Trade | 10/m  | Unsigned tx for leveraged short                           |
| `closeLong`       | Trade | 10/m  | Unsigned tx to close long (1-100%)                        |
| `closeShort`      | Trade | 10/m  | Unsigned tx to close short (1-100%)                       |
| `openLimitLong`   | Trade | 10/m  | Unsigned tx for limit long order                          |
| `openLimitShort`  | Trade | 10/m  | Unsigned tx for limit short order                         |

> For full Zod schemas and return types, read `references/tool-schemas.md`.

### Tool Parameters (compact)

**Read tools:**
- `getPositions({ limit?: 1-500 })` — defaults to 100
- `getPoolStats({ endDate?: "YYYY-MM-DD" })`
- `getLiquidityInfo({})` — no params
- `getLeaderboard({ cohortId: string })`
- `getActiveCohorts({})` — no params
- `getMyEnrollments({})` — no params

**Trade tools:**
- `openLong({ collateralAmount, collateralTokenSymbol, tokenSymbol, leverage, takeProfit?, stopLoss? })`
- `openShort({ collateralAmount, collateralTokenSymbol, tokenSymbol, leverage, takeProfit?, stopLoss? })`
- `closeLong({ collateralTokenSymbol, tokenSymbol, percentage? })` — percentage defaults to 100
- `closeShort({ collateralTokenSymbol, tokenSymbol, percentage? })`
- `openLimitLong({ collateralAmount, collateralTokenSymbol, tokenSymbol, leverage, triggerPrice, limitPrice? })`
- `openLimitShort({ collateralAmount, collateralTokenSymbol, tokenSymbol, leverage, triggerPrice, limitPrice? })`

All trade tools are **wallet-scoped**: the wallet is injected from the authenticated API key, not from request params.

### Supported Token Symbols

The API uses specific symbol strings — wrong names return `ASSET_TOKEN_NOT_FOUND`:

| Symbol    | Works? | Notes                                      |
|-----------|--------|--------------------------------------------|
| `USDC`    | ✓      | Collateral token                           |
| `BONK`    | ✓      | Asset token                                |
| `JITOSOL` | ✓      | Asset token                                |
| `WBTC`    | ✓      | Asset token (use this — not "BTC")         |
| `SOL`     | ✗      | No direct SOL custody; use JITOSOL instead |
| `BTC`     | ✗      | Returns ASSET_TOKEN_NOT_FOUND              |

---

## Transaction Signing Flow

All 6 trade tools return unsigned transactions that the caller must sign and submit:

```
Agent calls tool (e.g. openLong)
  -> Adrena Data API builds unsigned Solana transaction
  -> Returns { requiresSignature: true, quote: {...}, transaction: "<base64>" }

Caller must:
  1. Decode: Buffer.from(transaction, "base64")
  2. Deserialize: VersionedTransaction.deserialize(buffer)
  3. Sign: tx.sign([walletKeypair])
  4. Submit: connection.sendRawTransaction(tx.serialize())
```

**TypeScript example:**
```typescript
const { transaction, quote } = result;
const tx = VersionedTransaction.deserialize(Buffer.from(transaction, "base64"));
tx.sign([keypair]);
const sig = await connection.sendRawTransaction(tx.serialize());
```

**Python example:**
```python
from solders.transaction import VersionedTransaction
import base64

raw = base64.b64decode(result["transaction"])
tx = VersionedTransaction.from_bytes(raw)
tx.sign([keypair])
sig = client.send_raw_transaction(bytes(tx))
```

---

## Rate Limits & Errors

| Tier  | Limit   | Window | Tools                                              |
|-------|---------|--------|-----------------------------------------------------|
| Read  | 60/min  | Sliding | getPositions, getPoolStats, getLiquidityInfo, getLeaderboard, getActiveCohorts, getMyEnrollments, chat |
| Trade | 10/min  | Sliding | openLong, openShort, closeLong, closeShort, openLimitLong, openLimitShort |

**Error responses:**
- `400` — Invalid request (bad JSON, missing tool name)
- `401` — Invalid or missing API key
- `429` — Rate limited. Check `Retry-After` header (seconds).
- `500` — Server error

All errors return `{ "error": "description" }`.

---

## Autopilot SDK

Package: `@shoot/autopilot` in `sdk/`

The SDK provides 5 trading strategies that an autonomous agent can use to make trading decisions. The FlightController runs an autonomous tick loop, and the RiskHarness enforces guardrails.

**5 Playbooks:**
| Playbook      | Algorithm                              | Entry Signal                     |
|---------------|----------------------------------------|----------------------------------|
| TrendSurfer   | MACD histogram zero-line crossover     | Histogram sign flip              |
| FadeTrader    | Keltner Channel + Stochastic           | Price beyond bands + OS/OB       |
| RangeSniper   | ATR squeeze-expansion + VWAP bias      | Volatility regime change         |
| FundingArb    | Implied funding rate mean-reversion    | Crowding imbalance (counter-trend)|
| GridRunner    | Dynamic ATR grid around VWAP           | Price crosses grid level         |

**Core components:**
- `FlightController` — tick loop: fetch bars -> check guardrails -> assess -> validate -> execute
- `RiskHarness` — enforces: 5x max leverage, 25% max exposure, 3% stop-loss, 6% take-profit, 30s cooldown
- `OracleTap` — live prices from Pyth Hermes
- `ReplayTap` — deterministic bar replay for backtesting
- `PerpBuilder` — builds Adrena perpetual instructions
- `ShootProgram` — builds Shoot program agent registration instructions

> For complete type definitions, playbook configs, and wiring guide, read `references/sdk-playbooks.md`.

---

## Full Agent Lifecycle Sequence

The complete end-to-end flow an agent runs — two programs, one flow:

```
1. register_agent        → creates Agent PDA             [Shoot program]
2. initialize_challenge  → creates Challenge + Vault PDAs [Shoot program]  (admin)
3. enroll                → creates Enrollment PDA, pays entry fee [Shoot program]
4. openLong / openShort  → real Adrena perp position      [Adrena program via Data API]
   (repeat across 3+ different markets for best results)
5. submit_result         → records P&L + trade count on-chain [Shoot program]  (result authority)
6. update_agent_stats    → final stats update             [Shoot program]  (result authority)
```

**PDA collision on re-run:** `register_agent` fails if the Agent PDA already exists (same wallet, same keypair). Catch the error and skip — the account is already there.

**Scoring:** Results are evaluated on 5 dimensions — P&L %, log-scale volume, consistency, win rate, drawdown penalty. More trades across more markets = better score.

---

## On-Chain Program

Program ID: `4HVnwG8iz7wdUbEQDH8cYGD6EuxNmMuEbvCrz8Ke2iMG` (devnet)

**11 instructions** across 3 callers:

| Caller           | Instructions                                                              |
|------------------|---------------------------------------------------------------------------|
| Admin            | initialize_challenge, update_challenge_status, pause_challenge            |
| Trader           | enroll, claim_funded_status, register_agent, update_agent_strategy, retire_agent |
| Result Authority | submit_result, settle_challenge, update_agent_stats                       |

**4 account types:** Challenge, Enrollment, FundedTrader, Agent

**5 PDAs:**
- Challenge: `["challenge", admin, challenge_id]`
- Vault: `["vault", challenge]`
- Enrollment: `["enrollment", challenge, trader]`
- Funded: `["funded", trader]`
- Agent: `["agent", owner, owner[0..8]]`

> For full instruction parameters, account fields, error codes, and events, read `references/onchain-program.md`.

---

## Key Source Files

| File | Purpose |
|------|---------|
| `scripts/agent-adrena-surfpool.ts` | **End-to-end reference** — full lifecycle, real Adrena trades, Shoot program |
| `lib/agent/tools.ts` | 12 tool definitions with Zod schemas |
| `lib/agent/auth.ts` | API key auth (SHA-256 hash, Ed25519 verify) |
| `lib/agent/rate-limit.ts` | Sliding-window rate limiter |
| `app/api/agent/chat/route.ts` | Chat endpoint (GPT-4o + tools) |
| `app/api/agent/execute/route.ts` | Direct tool dispatch endpoint |
| `app/api/agent/keys/route.ts` | API key CRUD |
| `lib/adrena/client.ts` | Adrena Data API client (transaction builder) |
| `sdk/src/` | Autopilot SDK (playbooks, FlightController, RiskHarness) |
| `programs/shoot/src/lib.rs` | On-chain Anchor program |
| `docs/guides/agent-api.mdx` | Full API documentation |
| `scripts/agent-chat-surfpool.ts` | GPT-4o reasoning agent example (local dev) |
| `scripts/run-agent-surfpool.ts` | Headless autopilot agent example (local dev) |

---

---

## Dev / Local Testing with Surfpool

Surfpool is a local Solana validator that forks mainnet state on demand. Use it to test the full agent lifecycle without spending real funds.

### Start in mainnet-fork mode

```bash
cd programs/shoot
surfpool start --no-tui --yes --rpc-url https://api.mainnet-beta.solana.com
```

This clones Adrena's program (`13gDzEXCdocbj8iAiqrScGo47NiSuYENGsRqi3SEAwet`), pool, custody accounts, and USDC mint from mainnet. Real Adrena trade instructions execute locally at `http://localhost:8899`.

### 3 quirks you must handle

**A — API validates mainnet USDC balance, not Surfpool balance**

`datapi.adrena.trade` checks the wallet's real on-chain USDC balance before building any transaction. It does NOT see Surfpool state. If the wallet has less USDC on mainnet than `collateralAmount`, the API returns:
```json
{ "code": "INSUFFICIENT_COLLATERAL_BALANCE", "message": "Available: 0.8, Required: 1.0" }
```
Fix: the agent wallet needs real mainnet USDC. Even $1 is enough — keep `collateralAmount` ≤ mainnet balance (0.3–0.8 USDC works well). Fund the Surfpool wallet generously via `surfnet_setAccount` for on-chain execution.

**B — Replace blockhash before signing**

The API embeds a mainnet blockhash that Surfpool rejects. After deserializing, fetch a fresh one from Surfpool:

```typescript
const vtx = VersionedTransaction.deserialize(Buffer.from(base64Tx, "base64"));
const { blockhash } = await connection.getLatestBlockhash("confirmed");
vtx.message.recentBlockhash = blockhash;  // ← required for Surfpool
vtx.sign([keypair]);
const sig = await connection.sendRawTransaction(vtx.serialize(), { skipPreflight: true });
```

On **mainnet**, the API's blockhash is already valid — skip this step.

**C — Close positions return 400 on fork**

`closeLong` / `closeShort` ask the API to look up your open positions on mainnet. Since the positions exist only on Surfpool's fork, the API returns `POSITION_NOT_FOUND`. On mainnet this works correctly. For local testing: open positions → skip closes → call `submitResult`.

### Wallet funding

```typescript
// Fund SOL
await surfnetRpc("surfnet_setAccount", [{
  address: wallet.publicKey.toString(),
  lamports: 10_000_000_000,
  data: "", owner: "11111111111111111111111111111111", executable: false
}]);
// Fund USDC ATA — see lib/agent/surfpool-tools.ts for the helper
```

Agent keypair is in `.env` as `AGENT_KEYPAIR` (JSON byte array). Agent wallet: `5MTGtCFmVRJjN76HwNrPuzFPfsrC3MuPoYxhAqvD9VwE`.

### Explorer links for local transactions

```
https://explorer.solana.com/tx/{sig}?cluster=custom&customUrl=http%3A%2F%2Flocalhost%3A8899
```

### Reference implementation

`scripts/agent-adrena-surfpool.ts` is the complete working example — GPT-4o agent, real Adrena API, Surfpool fork, full Shoot lifecycle, explorer links. Start here.

---

## Not In Scope

- **Frontend UI components** — React components in `app/components/`
- **Database schema** — Prisma models are implementation details
