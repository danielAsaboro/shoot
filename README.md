# Adrena Prop Challenge Hub

> **Live app:** [shoot-production-f218.up.railway.app](https://shoot-production-f218.up.railway.app/)
> **Documentation:** [docs-1f2b6c2c.mintlify.app](https://docs-1f2b6c2c.mintlify.app/)
> **On-chain program:** [`4HVnwG8iz7wdUbEQDH8cYGD6EuxNmMuEbvCrz8Ke2iMG`](https://explorer.solana.com/address/4HVnwG8iz7wdUbEQDH8cYGD6EuxNmMuEbvCrz8Ke2iMG?cluster=devnet) (devnet)

Competition module for Adrena that combines prop-style trading challenges with a World Cup knockout tournament and autonomous autopilot trading. Built on Next.js 16, React 19, Rust keeper infrastructure, and real Adrena position data.

## Quick start

```shell
npm install
npm run dev           # http://localhost:3000
npm test              # 278 tests (main app)

cd sdk && npm install && npm test   # 144 tests (autopilot SDK)
```

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Frontend (Next.js 16 / React 19)                               │
│  Arena Hub · Leaderboard · Projection Lab · World Cup Bracket   │
├─────────────────────────────────────────────────────────────────┤
│  API Routes                                                     │
│  /competition · /world-cup · /cron · /agent · /admin · /health  │
├──────────────────────────┬──────────────────────────────────────┤
│  Core Engine             │  Autopilot SDK (@shoot/autopilot)    │
│  Scoring · Sybil · Quests│  5 Playbooks · Indicators · Risk      │
│  Streaks · Narrative     │  24/7 Autonomous Execution           │
├──────────────────────────┼──────────────────────────────────────┤
│  PostgreSQL (Prisma)     │  Solana Program (Anchor)             │
│  18 models               │  11 instructions · 4 account types   │
│                          │  22 error variants · 11 events       │
├──────────────────────────┼──────────────────────────────────────┤
│  Keeper Service (Rust)   │  Adrena Data API                     │
│  Yellowstone gRPC        │  datapi.adrena.trade                 │
│  Position Monitor        │  Live positions · Pool stats         │
│  Scoring Engine          │  Liquidity · APR                     │
│  Lifecycle FSM           │                                      │
└──────────────────────────┴──────────────────────────────────────┘
```

## Deployment

**Production:** Deployed on [Railway](https://railway.app) via Docker.

```shell
npm run build         # Next.js standalone build
docker compose up     # Local: app + PostgreSQL
```

**Keeper service:**

```shell
cd keeper
cargo build --release
GRPC_ENDPOINT=... DATABASE_URL=... cargo run --release
```

**Database:** PostgreSQL via Prisma. In dev mode, use `prisma db push` directly — no migrations needed.

```shell
npx prisma db push
npx tsx prisma/seed/index.ts   # seed data
```

**Cron jobs:** All cron endpoints are POST requests triggered by an external scheduler (e.g. Railway cron, GitHub Actions, or any HTTP scheduler). This is by design — no Vercel cron dependency.

```shell
# Refresh scores every 5 minutes
curl -X POST -H "Authorization: Bearer $CRON_SECRET" \
  https://shoot-production-f218.up.railway.app/api/cron/refresh-scores

# Rotate cohorts every 15 minutes
curl -X POST -H "Authorization: Bearer $CRON_SECRET" \
  https://shoot-production-f218.up.railway.app/api/cron/rotate-cohorts
```

## On-chain program

Anchor program at `programs/shoot/src/lib.rs` — manages USDC entry fees, challenge vaults, prize settlement, and autonomous agent registration on Solana.

- **Program ID:** `4HVnwG8iz7wdUbEQDH8cYGD6EuxNmMuEbvCrz8Ke2iMG`
- **Cluster:** Devnet
- **Instructions:** `initialize_challenge`, `enroll`, `submit_result`, `settle_challenge`, `claim_funded_status`, `update_challenge_status`, `pause_challenge`, `register_agent`, `update_agent_strategy`, `retire_agent`, `update_agent_stats`
- **Events:** 11 emitted events for client indexing (ChallengeCreated, TraderEnrolled, ResultSubmitted, etc.)
- **Security:** Dual authority model (admin multisig + result_authority hot wallet), state machine enforcement, vault balance pre-checks, checked arithmetic

```shell
cd programs/shoot
anchor build
anchor deploy        # deploys to devnet
```

## Autopilot SDK

Autonomous trading strategies that execute 24/7 within prop challenges. Human traders design the strategy; the autopilot executes.

```shell
cd sdk
npm install
npm test             # 144 tests
```

**5 playbook strategies:**

| Playbook    | Signal Logic                              | Best For                 |
| ----------- | ----------------------------------------- | ------------------------ |
| TrendSurfer | MACD histogram zero-line crossover        | Trending markets         |
| FadeTrader  | Keltner Channel + Stochastic confirmation | Fading extremes          |
| RangeSniper | ATR squeeze-expansion + VWAP deviation    | Volatility regime change |
| FundingArb  | Implied funding rate mean-reversion       | Perp-specific crowding   |
| GridRunner  | Dynamic ATR-based grid around VWAP        | Range-bound markets      |

**Indicators:** VWAP, ATR, MACD, Stochastic, Keltner Channels — all pure functions.

**Risk management:** RiskHarness enforces ceiling leverage, exposure fraction, cut-loss, lock-gain, and cooldown between trades.

**Price feed:** Pyth Hermes real-time data via OracleTap, deterministic ReplayTap for testing.

## Keeper service

Rust-based position monitor and scoring engine matching Adrena's keeper infrastructure pattern (Yellowstone gRPC + PostgreSQL).

- **gRPC subscriber:** Monitors Adrena position account changes in real-time via Yellowstone
- **Position decoder:** Borsh deserialization of Adrena's 248-byte position struct
- **Scoring engine:** Pure-function composite score: `(Net P&L / max(Drawdown, 0.01)) × Activity × Duration`
- **Lifecycle FSM:** Strict linear progression: Upcoming → Live → Scoring → Settled
- **REST API:** Health, competitions, agents, leaderboard, SSE live updates, Prometheus metrics

## What is included

### Competition Engine

- **5-tier prop challenges** (Scout $2 → Apex $50) with profit targets, drawdown limits, and daily loss limits
- **Specialist challenges** restricting traders to Forex, Commodities, Crypto, or Multi-Asset markets — driving RWA adoption
- **Multi-dimensional scoring**: `(PnL% × 8.5) + (log₁₀(volume) × 6) + (consistency × 0.28) + (winRate × 0.08) − (drawdown × 0.65)`
- **Funded trader ladder** (5 levels with revenue share: 150–1500 bps)
- **Desk system** (teams of 3–5 with aggregate scoring and promotion/relegation)

### World Cup Tournament

- **4-division structure**: Crypto Cup, Metals Cup, Energy Cup, Forex Cup
- **Group stage** → **single-elimination knockout** → **Grand Finals**
- **RAROI head-to-head scoring**: `ROI% × WinRateFactor × ActivityFactor − DrawdownPenalty`
- **Redemption bracket** for eliminated traders (64% participation in alpha)

### Engagement Systems

- **10 phased quests** awarding Mutagen + raffle tickets
- **Streak tracker** with multiplier bands (up to 5× at 10+ days)
- **Raffle ticket system** from challenge completion, quests, and streaks
- **8 risk event types** (flash crash, liquidity drain, volatility spike, etc.)
- **Narrative beat generator** for dynamic competition storytelling

### Anti-Abuse

- **Sybil detection**: funding source clustering, trading pattern correlation, PnL mirroring
- **Convergence filter**: all 3 heuristics must flag before a wallet is marked
- **Flagged traders visible on leaderboard but ineligible for rewards**

### Fee Allocation

- **60% rewards** — prize pool for top finishers
- **25% ADX buyback** — executed via Jupiter V6 swap (USDC → ADX) on cohort settlement
- **15% raffle** — cryptographic weighted random draw for all participants

### Adrena Integration

- **Real position data** from `datapi.adrena.trade/position`
- **On-chain enrollment** with USDC entry fees to program vault
- **On-chain settlement** with USDC payouts from vault to traders
- **SSE streaming** with WebSocket fallback for live leaderboard updates
- **Yellowstone gRPC** real-time position monitoring via keeper service

## Live API endpoints

```shell
# Health check
GET /api/health

# Competition snapshot
GET /api/competition/snapshot?wallet=<address>

# Real positions + computed metrics for any Adrena wallet
GET /api/adrena-live/positions?wallet=<address>&windowStart=<iso>&windowEnd=<iso>

# Real-time Adrena pool stats and liquidity
GET /api/adrena-live/pool-stats

# SSE stream for live updates
GET /api/competition/stream

# Keeper endpoints (Rust service on port 8080)
GET /api/health
GET /api/competitions
GET /api/agents
GET /api/leaderboard/:competition_id
GET /api/competitions/:id/live      # SSE
GET /api/metrics                    # Prometheus
```

## Key files

| File                                     | Purpose                                                                                      |
| ---------------------------------------- | -------------------------------------------------------------------------------------------- |
| `app/page.tsx`                           | Competition hub entrypoint                                                                   |
| `lib/competition/engine.ts`              | Scoring, challenge evaluation, RAROI                                                         |
| `lib/competition/adrena-live-adapter.ts` | Real Adrena data adapter                                                                     |
| `lib/competition/buyback.ts`             | ADX buyback via Jupiter V6                                                                   |
| `lib/competition/sybil-detector.ts`      | Sybil + abuse detection engine                                                               |
| `lib/adrena/client.ts`                   | Adrena Data API client                                                                       |
| `lib/adrena/metrics.ts`                  | Position → performance metric computation                                                    |
| `lib/solana/program.ts`                  | PDA derivation + instruction builders (11 instructions)                                      |
| `lib/world-cup/engine.ts`                | World Cup bracket, group stage, RAROI                                                        |
| `programs/shoot/src/lib.rs`              | On-chain Anchor program (11 ix, 22 errors, 11 events)                                        |
| `keeper/src/main.rs`                     | Rust keeper service entry point                                                              |
| `keeper/src/scoring/engine.rs`           | Composite score computation (pure functions)                                                 |
| `keeper/src/grpc/subscriber.rs`          | Yellowstone gRPC position monitor                                                            |
| `keeper/src/lifecycle/fsm.rs`            | Competition state machine                                                                    |
| `sdk/src/playbooks/`                     | 5 autopilot trading playbooks (TrendSurfer, FadeTrader, RangeSniper, FundingArb, GridRunner) |
| `sdk/src/cockpit/flight-controller.ts`   | Autonomous trading loop                                                                      |
| `sdk/src/indicators/`                    | Pure-function indicators (VWAP, ATR, MACD, Stochastic, Keltner)                              |
| `data/competition-cohorts.json`          | Live cohort config with 26 real trader wallets                                               |

## Tests

**422+ tests** across three modules:

| Module        | Tests | Suites | Coverage                                                                 |
| ------------- | ----- | ------ | ------------------------------------------------------------------------ |
| Main app      | 278   | 17     | Scoring, abuse, enrollment, World Cup, quests, streaks, narrative, sybil |
| Autopilot SDK | 144   | 14     | Indicators, playbooks, cockpit, risk harness, feed, on-chain             |
| Keeper (Rust) | 60+   | 4      | Scoring engine, metrics, position decoder, lifecycle FSM                 |

```shell
npm test                          # main app (278 tests)
cd sdk && npm test                # autopilot SDK (144 tests)
cd keeper && cargo test           # keeper service (60+ tests)
```

## Documentation

Full documentation at [docs-1f2b6c2c.mintlify.app](https://docs-1f2b6c2c.mintlify.app/), covering:

- Competition design — tier specs, specialist challenges, scoring formulas
- Sybil detection — heuristics, convergence filter, ops workflow
- On-chain program — 11 instructions, PDA derivation, authority model, events
- Autopilot SDK — strategies, indicators, risk management, execution loop
- Keeper service — gRPC subscriber, scoring engine, lifecycle FSM
- Deployment guide — Railway, PostgreSQL, cron setup, keeper deployment
- Configuration reference — env vars, cohort config, tier parameters
- Alpha test report — 24 participants, simulated devnet profiles
- Live validation — 22 real Adrena wallets, API pipeline verification
