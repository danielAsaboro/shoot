# Adrena Prop Challenge Hub

## Proposed format

Prop Challenge Hub is a rolling cohort competition module for Adrena. Traders
pay a small entry fee, join a preset-driven cohort, and compete on a visible
tournament score instead of a raw PnL board alone.

V1 uses one reusable rules engine with multiple preset narratives:

- Macro Sprint for FX and macro-oriented RWA pairs
- Carry Breaker for commodities and rate-sensitive rotation
- Crypto Impulse for high-beta crypto perps

This keeps the system extensible while preserving one operationally simple
competition backend.

## Challenge Tier Parameters

| Tier    | Entry Fee | Min Capital | Profit Target | Max DD | Daily Limit | Duration | Funded Eligible | Retry Discount |
| ------- | --------- | ----------- | ------------- | ------ | ----------- | -------- | --------------- | -------------- |
| Scout   | $2        | $50         | 8%            | 5%     | 3%          | 7 days   | No              | 30%            |
| Ranger  | $5        | $200        | 10%           | 8%     | 4%          | 10 days  | No              | 30%            |
| Veteran | $10       | $500        | 12%           | 6%     | 3%          | 10 days  | No              | 30%            |
| Elite   | $25       | $2,000      | 15%           | 5%     | 2.5%        | 14 days  | Yes             | 30%            |
| Apex    | $50       | $5,000      | 15%           | 4%     | 2%          | 14 days  | Yes             | 30%            |

**When to adjust:**

- Pass rate > 40%: tighten profit target by 2pp or reduce max drawdown by 1pp
- Pass rate < 15%: relax drawdown limit by 1pp or extend duration by 2 days
- Retry rate < 20%: increase discount to 40%

## Specialist Challenges

Specialist challenges restrict traders to a single asset class, driving
adoption of Adrena's RWA markets while rewarding domain expertise.

| Specialist  | Markets                        | Bonus Multiplier |
| ----------- | ------------------------------ | ---------------- |
| Forex       | EURUSD, GBPUSD, USDJPY, AUDUSD | 1.15×            |
| Commodities | XAU, XAG, WTI, BRENT           | 1.20×            |
| Crypto      | BTC, ETH, SOL, BONK            | 1.10×            |
| Multi-Asset | BTC, ETH, XAU, EURUSD, WTI     | 1.25×            |

Trading on disallowed markets during a specialist challenge immediately
disqualifies the attempt. The 5–25% bonus multiplier applies to the final
score, rewarding traders who demonstrate deep competence in a focused domain.

Specialist challenges serve as an RWA adoption driver: when Adrena launches
new commodity or forex perpetuals, a corresponding specialist challenge
creates immediate demand and liquidity.

## World Cup Format

The World Cup is a seasonal knockout tournament that runs alongside the
rolling prop challenges. It provides the highest-stakes competitive format.

### Structure

1. **4 Divisions** — Crypto Cup, Metals Cup, Energy Cup, Forex Cup
2. **Qualifying Phase** (2 weeks) — Top N traders per division by composite
   score qualify for the knockout bracket
3. **Knockout Phase** — Single-elimination bracket, head-to-head RAROI comparison
4. **Grand Finals** — Division champions compete in a 48-hour all-markets battle

### Redemption Bracket

Semi-final losers are paired in a separate redemption bracket. The redemption
winner earns the "Comeback" badge and re-enters the season point pool. This
keeps eliminated traders engaged instead of churning.

### Desk Wars

Traders are assigned to desks (teams of 3–5). Desk aggregate scores
contribute a supporter bonus. Top desk earns the "Desk Champion" badge
and an extra prize pool share.

## RAROI Formula

Risk-Adjusted Return on Investment (RAROI) is the head-to-head scoring metric
for World Cup matches. Unlike the additive cohort scoring (which also weights
volume to incentivize activity), RAROI is a multiplicative formula that
rewards skill-intensive trading:

```
RAROI = ROI% × WinRateFactor × ActivityFactor − DrawdownPenalty
```

Where:

- **ROI%** = realized P&L as percentage of starting equity
- **WinRateFactor** = min(2.0, 0.5 + (winRate/100) × 1.5)
- **ActivityFactor** = min(1.5, 0.5 + activeDays/totalDays)
- **DrawdownPenalty** = maxDrawdown% × 0.3

### Worked Example (Dave > Alice > Carol > Bob)

| Trader | ROI% | Win Rate | Active Days | Total Days | Max DD | RAROI     |
| ------ | ---- | -------- | ----------- | ---------- | ------ | --------- |
| Dave   | 40%  | 70%      | 14          | 14         | 5%     | **91.50** |
| Alice  | 20%  | 60%      | 13          | 14         | 3%     | **39.10** |
| Carol  | 25%  | 50%      | 7           | 14         | 5%     | **29.75** |
| Bob    | 2%   | 55%      | 10          | 14         | 2%     | **2.62**  |

**Dave** dominates with high ROI, strong win rate, and perfect activity — even
with the same 5% drawdown as Carol, his multiplicative advantage is decisive.

**Alice** beats Carol despite lower ROI because her 13/14 active days (AF=1.43)
and 60% win rate (WRF=1.4) multiply more effectively than Carol's 7/14 activity.

**Bob** demonstrates that RAROI punishes low ROI harshly — even with the best
drawdown (2%), a 2% ROI produces a negligible score because the multiplicative
factors amplify the base ROI.

## Rules and scoring

- Users join a time-bounded cohort with a fixed participant cap.
- Tournament score is computed from:
  - realized PnL percentage
  - trading volume
  - consistency score
  - win rate
  - max drawdown penalty
- Ties break by higher PnL, then higher volume, then earliest attainment time.
- Suspicious accounts remain visible on the board but cannot claim rewards until
  ops review is complete.

## Reward structure

- Entry fees contribute to each cohort prize pool.
- Fee allocation: 60% rewards pool, 25% ADX buyback, 15% raffle prizes.
- Top five eligible traders receive deterministic payout splits.
- Top finishers also earn Funded Trader season status with modeled revenue-share
  eligibility.
- Quest points, streak boosts, and raffle tickets are layered on top so users
  still care even when they are outside the cash line.
- A projection lab shows how changing trader behavior alters rank, payout, and
  funded progression, making the format easier to understand and harder to ignore.

## Competitive Analysis

### vs Jupiter Perps Competitions

Jupiter runs simple PnL leaderboards with no entry fee. Adrena's prop challenge
format adds: paid entry (anti-sybil), funded trader progression (retention),
specialist challenges (RWA adoption), and engagement loops (quests/streaks/raffles).

### vs Drift Trading Competitions

Drift competitions focus on volume incentives. Adrena's scoring is multi-dimensional
(PnL + volume + consistency + win rate − drawdown), preventing pure volume farming
from dominating the leaderboard.

### vs Hyperliquid Competitions

Hyperliquid runs invite-only competitions for elite traders. Adrena's tiered system
(Scout → Apex) creates an accessible on-ramp: anyone can start at $2 Scout and
work up to Apex. The World Cup format then provides the elite competitive layer.

### Adrena's RWA Moat

No competitor offers specialist challenges across forex, commodities, and crypto
perpetuals. Adrena's Autonom-powered RWA markets are a unique differentiator —
the specialist challenge format directly converts this technical moat into
user engagement and liquidity.

## Integration with Adrena systems

- Leaderboard updates are exposed through a leaderboard delta export.
- Quest rewards are exposed through a dedicated engagement adapter.
- Streak state is updated through the same engagement boundary.
- Raffle ticket issuance is modeled through the adapter instead of embedded UI logic.
- Reward settlement remains mocked in this repo, but the interface is isolated
  so Adrena backend services can replace it directly.
- The prototype now includes a real devnet SOL enrollment payment to a demo treasury
  plus a receipt state so reviewers can verify the paid-entry loop.
- An ops rail exposes abuse review queues and settlement-adjacent surfaces so
  competition operations are part of the product, not an afterthought.

## Why this is more engaging

- It replaces passive leaderboard watching with an explicit enrollment decision.
- Paid entry introduces commitment and raises the cost of sybil farming.
- Funded-season status creates an aspirational progression layer beyond one-off prizes.
- Preset narratives let Adrena spotlight new Autonom-powered RWA markets without
  building one-off event code for each launch.
- Quests, streaks, and raffles turn cohorts into an engagement hub rather than a
  single leaderboard page.

## Edge cases and abuse prevention

- Manual-review, sybil, wash-trading, and self-trading flags all block rewards.
- Flagged users remain publicly visible to preserve leaderboard transparency.
- Capacity and fixed windows prevent late unlimited farming.
- Deterministic tie-breakers avoid operator discretion at payout boundaries.
- Sybil detection heuristics: same funding source within 1h = cluster, 3+ wallets
  from same source = flagged for manual review, identical entry timestamps elevate
  confidence to "high".

## Scope & Status

This prototype includes two categories of features:

**Production-ready (live data):** Leaderboard scoring, enrollment with devnet
payments, challenge tier selection, sybil detection, live Adrena data adapter,
and the projection lab. These work end-to-end with real trader positions from
`datapi.adrena.trade`.

**Design proposals (Phase 2):** Funded trader progression, Desk Wars, risk
events, spectator voting, rivalry tracking, narrative commentary, head-to-head
matchups, and World Cup tournaments. These are fully implemented in mock mode
to demonstrate the intended UX but require database persistence, on-chain
programs, and admin tooling before production deployment.

See [feature-status.md](feature-status.md) for the complete breakdown.

## Deployment and configuration

- Run the app with `npm run dev`.
- Cohort presets, prize splits, and seeded traders are configured in
  the database and `lib/competition/config.ts`.
- Competition snapshots are served through `app/api/competition/snapshot`.
- Set `NEXT_PUBLIC_COMPETITION_PROVIDER=adrena` and
  `ADRENA_COMPETITION_API_BASE_URL` to forward snapshot requests to an Adrena
  upstream API.
- A sample upstream contract is available at `app/api/adrena-upstream/snapshot`
  so the Adrena provider path can be exercised locally without backend access.
- A source-record mapping example is available at
  `app/api/adrena-upstream/mapped-snapshot`.
- A machine-readable schema and example payload are available at
  `app/api/adrena-upstream/schema`.
- Database schema is at `lib/competition/schema.sql`.
- Keep the current wallet flow on devnet for prototype review.
