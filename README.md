# Adrena Prop Challenge Hub

> **Live app:** [shoot-production-f218.up.railway.app](https://shoot-production-f218.up.railway.app/)
> **Documentation:** [docs-1f2b6c2c.mintlify.app](https://docs-1f2b6c2c.mintlify.app/)
> **On-chain program:** [`4HVnwG8iz7wdUbEQDH8cYGD6EuxNmMuEbvCrz8Ke2iMG`](https://explorer.solana.com/address/4HVnwG8iz7wdUbEQDH8cYGD6EuxNmMuEbvCrz8Ke2iMG?cluster=devnet) (devnet)

Competition module for Adrena that combines prop-style trading challenges with a World Cup knockout tournament. Built on Next.js 16, React 19, and real Adrena position data from `datapi.adrena.trade`.

## Quick start

```shell
npm install
npm run dev           # http://localhost:3000
npm test              # 191 tests
```

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Frontend (Next.js 16 / React 19)                               │
│  Arena Hub · Leaderboard · Projection Lab · World Cup Bracket   │
├─────────────────────────────────────────────────────────────────┤
│  API Routes                                                     │
│  /api/competition/* · /api/world-cup/* · /api/cron/* · /admin/* │
├─────────────────────────────────────────────────────────────────┤
│  Core Engine                                                    │
│  Scoring · Sybil Detection · Quests · Streaks · Narrative       │
├──────────────────────────┬──────────────────────────────────────┤
│  PostgreSQL (Prisma)     │  Solana Program (Anchor)             │
│  18 models               │  USDC vaults · enrollment · settle   │
├──────────────────────────┴──────────────────────────────────────┤
│  Adrena Data API (datapi.adrena.trade)                          │
│  Live positions · Pool stats · Liquidity · APR                  │
└─────────────────────────────────────────────────────────────────┘
```

## Deployment

**Production:** Deployed on [Railway](https://railway.app) via Docker.

```shell
npm run build         # Next.js standalone build
docker compose up     # Local: app + PostgreSQL
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

Anchor program at `programs/shoot/src/lib.rs` — manages USDC entry fees, challenge vaults, and prize settlement on Solana.

- **Program ID:** `4HVnwG8iz7wdUbEQDH8cYGD6EuxNmMuEbvCrz8Ke2iMG`
- **Cluster:** Devnet
- **Instructions:** `initialize_challenge`, `enroll`, `submit_result`, `settle_challenge`, `claim_funded_status`

```shell
cd programs/shoot
anchor build
anchor deploy        # deploys to devnet
```

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

## Live API endpoints

```shell
# Competition snapshot
GET /api/competition/snapshot?wallet=<address>

# Real positions + computed metrics for any Adrena wallet
GET /api/adrena-live/positions?wallet=<address>&windowStart=<iso>&windowEnd=<iso>

# Real-time Adrena pool stats and liquidity
GET /api/adrena-live/pool-stats

# SSE stream for live updates
GET /api/competition/stream
```

## Key files

| File | Purpose |
|---|---|
| `app/page.tsx` | Competition hub entrypoint |
| `lib/competition/engine.ts` | Scoring, challenge evaluation, RAROI |
| `lib/competition/adrena-live-adapter.ts` | Real Adrena data adapter |
| `lib/competition/buyback.ts` | ADX buyback via Jupiter V6 |
| `lib/competition/sybil-detector.ts` | Sybil + abuse detection engine |
| `lib/adrena/client.ts` | Adrena Data API client |
| `lib/adrena/metrics.ts` | Position → performance metric computation |
| `lib/world-cup/engine.ts` | World Cup bracket, group stage, RAROI |
| `programs/shoot/src/lib.rs` | On-chain Anchor program |
| `data/competition-cohorts.json` | Live cohort config with 26 real trader wallets |

## Tests

191 tests across 21 suites covering scoring logic, abuse policies, enrollment flows, projections, World Cup group draws, risk events, narrative generation, sybil detection, desk standings, funded ladder progression, and Adrena API schema normalization.

```shell
npm test              # run all tests
npm run lint          # ESLint check
npm run build         # production build
npm run ci            # build + lint + format check
```

## Documentation

Full documentation at [docs-1f2b6c2c.mintlify.app](https://docs-1f2b6c2c.mintlify.app/), covering:

- Competition design — tier specs, specialist challenges, scoring formulas
- Sybil detection — heuristics, convergence filter, ops workflow
- On-chain program — instructions, PDA derivation, authority model
- Deployment guide — Railway, PostgreSQL, cron setup
- Configuration reference — env vars, cohort config, tier parameters
- Alpha test report — 24 participants, simulated devnet profiles
- Live validation — 22 real Adrena wallets, API pipeline verification
