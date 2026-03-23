# Live Data Validation Report

**Generated:** 2026-03-23T11:33:16.935Z
**API:** https://datapi.adrena.trade
**Wallets tested:** 22

## API Performance

| Metric      | Value  |
| ----------- | ------ |
| Avg latency | 582ms  |
| Min latency | 492ms  |
| Max latency | 1194ms |
| Errors      | 0      |

## Crypto Impulse 02.01 (cohort-crypto-0201)

**Window:** 2026-02-01T00:00:00.000Z → 2026-02-15T00:00:00.000Z
**Wallets:** 10 enrolled, 5 with trades in window
**Sybil flags:** 0

| Rank | Wallet          | Trades | PnL%   | Volume          | Win%   | Days | Mutagen  | Tournament |
| ---- | --------------- | ------ | ------ | --------------- | ------ | ---- | -------- | ---------- |
| 1    | 4N69yzFF...KMX4 | 1      | 9.01%  | $13,293,369     | 100%   | 1    | 1.2004   | 141.4      |
| 2    | 56yW76VP...CcoS | 2      | 6.7%   | $39,181,149     | 50%    | 1    | 1.2023   | 120.5      |
| 3    | ErVgLQB4...a9po | 427    | 4.6%   | $20,341,977,657 | 61.12% | 13   | 212.7008 | 108.8      |
| 4    | GZXqnVpZ...GhBb | 16     | -5.85% | $9,884,848      | 56.25% | 6    | 1.0267   | 10.7       |
| 5    | C9jxD53T...cHnt | 0      | 0%     | $0              | 0%     | 0    | 0.0000   | 0.0        |
| 6    | 4QLQUhJE...LsLu | 0      | 0%     | $0              | 0%     | 0    | 0.0000   | 0.0        |
| 7    | 7QYoineP...V5Pu | 0      | 0%     | $0              | 0%     | 0    | 0.0000   | 0.0        |
| 8    | F179Gtjo...b5Z1 | 0      | 0%     | $0              | 0%     | 0    | 0.0000   | 0.0        |
| 9    | 6ALGMay8...9zgy | 0      | 0%     | $0              | 0%     | 0    | 0.0000   | 0.0        |
| 10   | 8anmrYFm...f6Wy | 454    | 3.24%  | $5,415,489,182  | 63%    | 13   | 212.2813 | -269.7     |

## Macro Sprint 02.15 (cohort-macro-0215)

**Window:** 2026-02-15T00:00:00.000Z → 2026-03-01T00:00:00.000Z
**Wallets:** 8 enrolled, 3 with trades in window
**Sybil flags:** 0

| Rank | Wallet          | Trades | PnL%  | Volume         | Win%   | Days | Mutagen | Tournament |
| ---- | --------------- | ------ | ----- | -------------- | ------ | ---- | ------- | ---------- |
| 1    | GZXqnVpZ...GhBb | 5      | 2.25% | $39,803        | 60%    | 3    | 0.7417  | 55.8       |
| 2    | ErVgLQB4...a9po | 29     | 5.41% | $7,587,511,946 | 72.41% | 2    | 7.5966  | 55.3       |
| 3    | 8anmrYFm...f6Wy | 46     | 1.35% | $7,471,854,361 | 47.83% | 3    | 6.4191  | 14.8       |
| 4    | DWcFRJrp...ohvY | 0      | 0%    | $0             | 0%     | 0    | 0.0000  | 0.0        |
| 5    | sigMag9S...V4ig | 0      | 0%    | $0             | 0%     | 0    | 0.0000  | 0.0        |
| 6    | HjcswYCP...NjqW | 0      | 0%    | $0             | 0%     | 0    | 0.0000  | 0.0        |
| 7    | CDUwP2Fr...2bg6 | 0      | 0%    | $0             | 0%     | 0    | 0.0000  | 0.0        |
| 8    | 8umPs96c...6fbN | 0      | 0%    | $0             | 0%     | 0    | 0.0000  | 0.0        |

## Carry Breaker 03.01 (cohort-carry-0301)

**Window:** 2026-03-01T00:00:00.000Z → 2026-03-15T00:00:00.000Z
**Wallets:** 8 enrolled, 1 with trades in window
**Sybil flags:** 0

| Rank | Wallet          | Trades | PnL%   | Volume   | Win% | Days | Mutagen | Tournament |
| ---- | --------------- | ------ | ------ | -------- | ---- | ---- | ------- | ---------- |
| 1    | GZXqnVpZ...GhBb | 3      | -3.66% | $812,396 | 0%   | 2    | 0.0538  | 18.3       |
| 2    | A6ELwd76...qW6j | 0      | 0%     | $0       | 0%   | 0    | 0.0000  | 0.0        |
| 3    | B3qwaaDG...csU8 | 0      | 0%     | $0       | 0%   | 0    | 0.0000  | 0.0        |
| 4    | 8EJMQy74...WHM4 | 0      | 0%     | $0       | 0%   | 0    | 0.0000  | 0.0        |
| 5    | 2o1odPv3...ei6N | 0      | 0%     | $0       | 0%   | 0    | 0.0000  | 0.0        |
| 6    | HZHXUqui...s5hp | 0      | 0%     | $0       | 0%   | 0    | 0.0000  | 0.0        |
| 7    | 6iGVCaVP...FCgQ | 0      | 0%     | $0       | 0%   | 0    | 0.0000  | 0.0        |
| 8    | 4PcPViGT...qqpH | 0      | 0%     | $0       | 0%   | 0    | 0.0000  | 0.0        |

## Summary

This report validates the live data pipeline end-to-end:

1. **Data fetch** — Successfully queried `https://datapi.adrena.trade/position` for 22 wallets
2. **Metric computation** — PnL%, volume, win rate, drawdown, and active days computed from real closed positions
3. **Mutagen scoring** — Per-trade Mutagen calculated using the official formula: (Performance + Duration) × Size Multiplier
4. **Tournament scoring** — Multi-dimensional score: (PnL% × 8.5) + (log₁₀(volume) × 6) + (consistency × 0.28) + (winRate × 0.08) − (drawdown × 0.65)
5. **Sybil detection** — Funding source clustering checked across all cohort wallets

The `NEXT_PUBLIC_COMPETITION_PROVIDER=adrena` mode uses this same pipeline via `lib/competition/adrena-live-adapter.ts`.
