# Deployment & Configuration Guide

**Arena Hub — Adrena Prop Challenge + World Cup Engine**
Version 1.0 | March 2026

---

## Prerequisites

### Infrastructure (this prototype)
| Component | Version | Notes |
|---|---|---|
| Node.js | >= 20 LTS | Frontend and API server |
| PostgreSQL | >= 14 | **Optional** — for persistent state (enrollments, scores, quests, streaks, sybil flags) |

The prototype can run in two modes:
1. **Without DB** — Uses localStorage + JSON files (default). Good for UI review.
2. **With DB** — Set `DATABASE_URL` in `.env.local` for shared persistence across users.

### What This Prototype Uses

- **Next.js 16** with React 19 for the full-stack app
- **Prisma ORM** with PostgreSQL for server-side persistence (optional)
- **Privy** for wallet authentication (embedded + external wallets)
- **Adrena Data API** (`datapi.adrena.trade`) for real position data
- **localStorage** for client-side optimistic UI (quest progress, streaks)
- **JSON file** (`data/competition-cohorts.json`) for cohort configuration and wallet enrollment

### What Production Would Additionally Require

- **Redis** — For leaderboard caching and session state in a multi-instance deployment.
- **Cron scheduler** — The prototype includes a `/api/competition/refresh` endpoint that recomputes scores from live data. In production, this is called every 5 minutes via [cron-job.org](https://cron-job.org) (POST request). A more robust setup would use a dedicated job queue.
- **On-chain program** — Prize distribution, vault management, and challenge settlement would require a Solana program (Anchor). Not included.
- **Trade indexer** — For streaming trade events from Adrena's program via Yellowstone gRPC instead of polling the REST API.

### Access Required from Adrena Team (for production)
1. **Market list** with asset class tags (crypto/metals/energy/forex)
2. **Admin multisig address** for prize distribution authorization
3. **ADX token mint address** for reward payouts

---

## Local Development

### 1. Clone and install

```bash
git clone <repo-url>
cd shoot
npm install
```

### 2. Environment variables

Create `.env.local`:

```bash
# Required: Privy app ID for wallet auth
NEXT_PUBLIC_PRIVY_APP_ID=your-privy-app-id

# Competition data source: "mock" (default) or "adrena"
NEXT_PUBLIC_COMPETITION_PROVIDER=mock

# Optional: override devnet RPC (default: api.devnet.solana.com)
NEXT_PUBLIC_SOLANA_RPC=https://api.devnet.solana.com

# Optional: demo treasury address for devnet entry payments
NEXT_PUBLIC_DEMO_TREASURY=Ff34MXWdgNsEJ1kJFj9cXmrEe7y2P93b95mGu5CJjBQJ

# Optional: Discord webhook for competition notifications
# Create a webhook in your Discord server settings → Integrations → Webhooks
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...

# Optional: separate ops webhook for sybil alerts (defaults to DISCORD_WEBHOOK_URL)
DISCORD_OPS_WEBHOOK_URL=https://discord.com/api/webhooks/...

# Optional: cron secret to protect /api/cron/rotate-cohorts from public access
CRON_SECRET=your-random-secret
```

### 3. Database setup (optional)

```bash
# If using PostgreSQL for shared persistence:
# Add to .env.local:
# DATABASE_URL="postgresql://user:password@localhost:5432/adrena_competition"

# Run migrations
npx prisma migrate dev --name init

# Or to just create tables without migration history:
npx prisma db push
```

Without `DATABASE_URL`, the app uses localStorage and JSON files (all features work, but state is per-browser).

### 4. Run development server

```bash
npm run dev
# → http://localhost:3000
```

### 4. Run tests

```bash
npm test                    # all 191 unit tests
npm run lint                # ESLint (zero errors expected)
npm run build               # production build check
```

---

## Data Modes

### Mock Mode (default)

```bash
NEXT_PUBLIC_COMPETITION_PROVIDER=mock npm run dev
```

Uses seeded data from the database and `lib/competition/config.ts`. Fully offline, no external API calls. Good for UI review.

### Adrena Live Mode

```bash
NEXT_PUBLIC_COMPETITION_PROVIDER=adrena npm run dev
```

Fetches **real trader positions** from `datapi.adrena.trade/position` for all wallets listed in `data/competition-cohorts.json`. Computes competition scores from actual Adrena trading data.

The cohorts file is pre-seeded with 26 real Adrena trader wallets across 3 cohorts spanning February–March 2026.

**Quick test without changing env vars:**

```bash
# The snapshot API accepts a provider override via query parameter
curl "http://localhost:3000/api/competition/snapshot?provider=adrena"
```

### Live Data Endpoints

These routes hit `datapi.adrena.trade` directly and are always available regardless of provider mode:

```bash
# Fetch real positions + computed metrics for any wallet
curl "http://localhost:3000/api/adrena-live/positions?wallet=ErVgLQB4hwGe9xegP6R83E6WE1tcRokcsEY1WT9xa9po"

# Fetch real-time pool stats and liquidity info
curl "http://localhost:3000/api/adrena-live/pool-stats"
```

---

## Architecture Overview

```
┌───────────────────────────────────────────────────┐
│  Next.js App (Vercel or self-hosted)               │
│                                                    │
│  /             → ArenaHub (tabs: Challenges, WC)   │
│  /design-doc   → Competition design documentation  │
│  /memo         → World Cup technical memo          │
│  /api/competition/snapshot  → Prop challenge data  │
│  /api/adrena-live/*         → Real Adrena API      │
│  /api/world-cup/*           → World Cup APIs       │
└───────────────┬───────────────────────────────────┘
                │
                │ NEXT_PUBLIC_COMPETITION_PROVIDER
                │
         ┌──────┴──────┐
         │             │
    ┌────▼────┐   ┌────▼──────────────────┐
    │  Mock   │   │  Adrena Live Adapter  │
    │  Data   │   │  (datapi.adrena.trade │
    │(default)│   │   → real positions)   │
    └─────────┘   └───────────────────────┘
```

**Data flow in Adrena mode:**
1. `adrena-live-adapter.ts` reads `data/competition-cohorts.json` for enrolled wallets
2. Fetches positions for each wallet from `datapi.adrena.trade/position?user_wallet=...`
3. `computeMetricsFromPositions()` derives PnL%, volume, win rate, consistency, drawdown
4. `computeTournamentScore()` produces composite ranking score
5. Sybil detection runs across the cohort (funding source clustering, pattern correlation, PnL mirroring)
6. `buildCompetitionSnapshotFromSources()` assembles the full snapshot for the UI

---

## Deploy to Vercel

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy preview build
vercel --env NEXT_PUBLIC_PRIVY_APP_ID=your-id

# Promote to production
vercel --prod
```

### Configure Privy

1. Create app at dashboard.privy.io
2. Enable: Embedded Wallets, External Wallets (Phantom, Backpack, Solflare)
3. Set allowed origins: `https://your-domain.vercel.app`, `http://localhost:3000`
4. Copy App ID to `NEXT_PUBLIC_PRIVY_APP_ID`

---

## Configuration Reference

### Environment variables

| Variable | Default | Description |
|---|---|---|
| `DATABASE_URL` | — | Optional. PostgreSQL connection string for persistent state. |
| `NEXT_PUBLIC_PRIVY_APP_ID` | — | Required. Privy app ID. |
| `NEXT_PUBLIC_COMPETITION_PROVIDER` | `mock` | `mock` or `adrena`. |
| `ADRENA_DATA_API_BASE_URL` | `https://datapi.adrena.trade` | Adrena Data API base URL. |
| `ADRENA_COMPETITION_API_BASE_URL` | — | Optional. Competition Service API (if Adrena team provides one). |
| `NEXT_PUBLIC_SOLANA_RPC` | `api.devnet.solana.com` | Solana RPC for balance/tx. |
| `NEXT_PUBLIC_DEMO_TREASURY` | hardcoded | Devnet demo treasury address. |

### Tier parameters (adjustable in `data/competition-cohorts.json`)

| Parameter | Scout | Ranger | Veteran | Elite | Apex |
|---|---|---|---|---|---|
| Entry fee (USDC) | 2 | 5 | 10 | 25 | 50 |
| Min capital ($) | 50 | 200 | 500 | 2,000 | 5,000 |
| Profit target (%) | 8 | 10 | 12 | 15 | 15 |
| Max drawdown (%) | 5 | 8 | 6 | 5 | 4 |
| Daily loss limit (%) | 3 | 4 | 3 | 3 | 2 |
| Duration (days) | 7 | 10 | 10 | 14 | 14 |
| Funded eligible | No | No | No | Yes | Yes |
| Retry discount | 30% | 30% | 30% | 30% | 30% |

**When to adjust:**
- Pass rate > 40%: tighten profit target by 2pp or reduce max drawdown by 1pp
- Pass rate < 15%: relax drawdown limit by 1pp or extend duration by 2 days
- Retry rate < 20%: increase discount to 40%

---

## Adding New Wallets to Live Cohorts

Edit `data/competition-cohorts.json` and add wallet addresses to a cohort's `enrolledWallets` array. The adapter will fetch their real positions from Adrena on the next snapshot request.

---

## Contacts

| Role | Contact |
|---|---|
| Frontend issues | Open GitHub issue on this repo |
| Adrena API integration | Coordinate with Adrena dev team |
| Sybil alerts | Ops channel in Adrena Discord |
