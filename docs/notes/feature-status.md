# Feature Status

This document clarifies which features work with live Adrena data and which
are design-phase prototypes demonstrated in mock mode only.

## Production Ready (Live Data)

These features function when `NEXT_PUBLIC_COMPETITION_PROVIDER=adrena` and
operate against real trader positions from `datapi.adrena.trade`.

| Feature | Description |
|---------|-------------|
| Leaderboard & Scoring | Multi-dimensional scoring computed from real closed positions |
| Enrollment & Entry Payments | Devnet SOL payments via Privy embedded wallets |
| Challenge Tier Selection | 5-tier prop challenge entry with configurable parameters |
| Sybil Detection Engine | Funding-source clustering, pattern correlation, PnL mirroring |
| Adrena Live Data Adapter | Real-time position fetch, metric computation, snapshot assembly |
| Projection Lab | What-if scoring with slider inputs against live cohort data |

## Design Proposals (Phase 2)

These features are fully implemented in mock mode to demonstrate the intended
UX. They require additional infrastructure before production deployment:

| Feature | Requires | Description |
|---------|----------|-------------|
| Funded Trader Progression | On-chain program, vault, admin tooling | 5-tier ladder with revenue share (see [funded-trader-proposal.md](funded-trader-proposal.md)) |
| Desk Wars | Database, team formation flow, admin panel | Team competition with promotion/relegation |
| Dynamic Risk Events | Real-time market data feed, event scheduler | 8 event types that modify trader metrics |
| Spectator Voting | Database, vote persistence, anti-spam | Crowd favorites and featured matchups |
| Rivalry Tracking | Database, match history persistence | Head-to-head records with intensity scoring |
| Live Commentary | Database, narrative event persistence | Auto-generated story beats for 10+ event types |
| Head-to-Head Matchups | Bracket management backend, cron scoring | Paired trader comparisons with odds |
| World Cup Tournament | Full tournament backend, bracket DB, admin | 4-division knockout with group stages |
| Quests (server-side) | Database for progress persistence | Currently localStorage; needs server-side state |
| Streaks (server-side) | Database for streak persistence | Currently localStorage; needs server-side state |
| Raffle Drawings | On-chain VRF or admin-managed draws | Ticket accumulation works; drawing mechanism needed |

## How to Test

```bash
# Mock mode — all features active with seeded data
NEXT_PUBLIC_COMPETITION_PROVIDER=mock npm run dev

# Live mode — production-ready features use real Adrena data
# Design-phase features show [Phase 2 Design] badges
NEXT_PUBLIC_COMPETITION_PROVIDER=adrena npm run dev
```
