/**
 * Database seeder — resets and repopulates PostgreSQL with realistic competition data.
 *
 * Run: npx tsx prisma/seed/index.ts
 *
 * Every run: clears all tables first, then seeds fresh. Fully idempotent.
 *
 * Seeds:
 *  1. Desks + World Cup traders
 *  2. Enrollments with starting equity
 *  3. Trader scores
 *  4. Quest progress + streak states
 *  5. Desk memberships
 *  6. World Cup season, groups, matches
 *  7. Daily missions + results
 *  8. Raffle entries
 *  9. Trade events + equity snapshots
 * 10. Narrative beats + sybil flags
 * 11. Spectator votes
 */

import { PrismaClient } from "../../lib/generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const cohortsData = require("../../data/competition-cohorts.json") as {
  config: {
    scoringWeights: {
      pnlPercent: number;
      volumeUsd: number;
      consistency: number;
      winRate: number;
      drawdownPenalty: number;
    };
  };
  cohorts: Array<{
    id: string;
    name: string;
    presetId: string;
    state: string;
    startTime: string;
    endTime: string;
    narrative?: string;
    rewardPoolUsd: number;
    entryFeeUsd: number;
    participantCap: number;
    enrolledWallets: string[];
    specialistType?: string;
    scoringMode?: string;
  }>;
};

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required. Set it in .env.local");
  process.exit(1);
}

const adapter = new PrismaPg({ connectionString: url });
const prisma = new PrismaClient({ adapter }) as unknown as PrismaClient;

// ── Seeded PRNG for deterministic generation ─────────────────────────────────

function createRng(seed: number) {
  let s = seed | 0;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

function hashStr(str: string): number {
  let hash = 7919;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

// ── Realistic wallet addresses (base58-like) ─────────────────────────────────

const WALLETS = [
  "5Zzguz4NsSRFxGkHfM4FmsFpGZiCKuoAW75Q7FjCtsNo",
  "4vRYLzHgLMHQECd9bFswjHpkJVqXDMnZHVoSYj5NiFKK",
  "Bmqxiw8yVyv3sBK9H2VFBb2KXR8jJNJRD7cUqMNwbDCB",
  "3jxMN1fvZvXNKZ3B1bYGGHGkfMSwPdohtxBr8duZqMcP",
  "8GfkEv6aeMY8YqaUVJE6qZxaBUyPxDwjCyM6bJSoMNJC",
  "DGZEZh7bHLDfDYbmZtFm4rrGqPKatK3P7G76qs5nSvWq",
  "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
  "J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn",
  "4T2jMruYsaCy2q47kauFSQBwZoCnhPRDFBUfTbooyVrS",
  "6bfGZGBQsmYj6cST7Rt3EkKV6sCNUPGbpLJgSPmHdmKv",
  "93hgKGc5NxNGStmQ38AJGA1Bp7dmpnHRWZMExFxCRfRi",
  "8CquQnLjDPFbmkMt3D6YyZC6hEaXFX2SafaFfCpygVfe",
  "2TWbRStPo7LSAm8upMqQRmPgD3sVfhFjS5m9aRWEcDu5",
  "HN7cABqLq46Es1jh92dQQisAi5YqpCh6Q7spSfaDMEGg",
  "7YttLkHDoNj9wyDur5pM1ejNaAvT9X4eSTYLFz8qgbMW",
  "EZGQyi2Z7kB6GNfrDxK6i7VQxz1ufWQMEFUcLr8X9TaG",
  "A8nPhpCJqtqHnqfwGKnKYMHRMZ1xR4DktrQMFbT6PNj4",
  "CWsARMppuL3Bqnrasa2fRjwMCRHRMNTtFg8dSTDfNLPP",
  "FKj6d4CdGLkLavcm5bU6x5RZwcAhUGNfR4SH7bGnDjkR",
  "3oGJ7Wwc8qn5QyMX3FMR4GfrNwN8RGsGjm8CqF8XWHZZ",
  "9qGJiVKfXLkSSWjrw8D9UZwGiVRqRQZmY7YSBjP4PNaH",
  "BpfCrG5jB9H5TcnFXLJ7h3QqP9RFgYTh4MnJVeG2xRw3",
  "DvFpW3xLu7VqXmSRjH9FgXP5LN2QY8kRJ9qTsMB2YCr6",
  "E8rKFf3vWqZjRR7YpHzWv5LZQmB9FjPX2CkDsTGVnNw4",
  "7mVGZ4hxW9jN3FkXr8YLPqJd2RsCTbQg5KnHvMF6xEw2",
  "AgP8Kd9Lx3mWvQR5YjZ7Hn2FsXTbCE6rJfDqM4N8wGy1",
  "C9dFrLH4n7jXkYP2Wv5QmZ8sRTbGE3Ag6KxJqN1wMy9f",
  "FhN2XqL7dK9GvWjR4Pm3Y8sZTb5CE6Ag1JxfMkQ1wRy3",
  "HjK3YrM8eL1GwXkS5Qn4Z9tATc6CF7Bh2JygNlR2xSz4",
  "JlM4ZsN9fO2HxYlT6Ro5A1uBUd7DG8Ci3KzhOmS3yTa5",
  "LnO5AtP1gQ3IyZmU7Sp6B2vCVe8EH9Dj4LaiPnT4zUb6",
  "NpQ6BuR2hS4JzAnV8Tq7C3wDWf9FI1Ek5MbjQoU5aVc7",
];

// ── Cohort definitions (single source of truth: data/competition-cohorts.json) ─

const COHORTS = cohortsData.cohorts.map((c) => ({
  ...c,
  walletCount: c.enrolledWallets.length,
}));

const CUSTODY_MINTS = [
  "So11111111111111111111111111111111111111112", // SOL
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", // USDC
  "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB", // USDT
];

// ── World Cup desk definitions ───────────────────────────────────────────────

const WORLDCUP_DESKS = [
  {
    id: "crypto-atlas",
    cupId: "crypto",
    name: "Atlas Desk",
    tier: "Premier",
    motto: "Fast tape, tight risk.",
    captainMission: "Own the weekly close without breaching the impact cap.",
    supporters: 1820,
  },
  {
    id: "crypto-latency",
    cupId: "crypto",
    name: "Latency Desk",
    tier: "Challenger",
    motto: "Win the open, survive the chop.",
    captainMission: "Capture the opening break and keep two green sessions.",
    supporters: 1260,
  },
  {
    id: "metals-gild",
    cupId: "metals",
    name: "Gild Desk",
    tier: "Premier",
    motto: "Patience compounds edge.",
    captainMission: "Finish above median consistency across four sessions.",
    supporters: 910,
  },
  {
    id: "metals-vault",
    cupId: "metals",
    name: "Vault Desk",
    tier: "Challenger",
    motto: "Macro read, no wasted motion.",
    captainMission: "Keep drawdown under the weekly cap while staying active.",
    supporters: 760,
  },
  {
    id: "energy-grid",
    cupId: "energy",
    name: "Grid Desk",
    tier: "Premier",
    motto: "Event windows, no panic.",
    captainMission: "Win both crude matchdays without a liquidation event.",
    supporters: 1380,
  },
  {
    id: "energy-refinery",
    cupId: "energy",
    name: "Refinery Desk",
    tier: "Challenger",
    motto: "Volatility with discipline.",
    captainMission: "Convert mission wins into desk points before the weekend.",
    supporters: 1090,
  },
  {
    id: "forex-orbit",
    cupId: "forex",
    name: "Orbit Desk",
    tier: "Premier",
    motto: "Cadence beats chaos.",
    captainMission: "Log five clean sessions around London and New York opens.",
    supporters: 1140,
  },
  {
    id: "forex-fix",
    cupId: "forex",
    name: "Fix Desk",
    tier: "Challenger",
    motto: "Macro flow, repeatable edge.",
    captainMission: "Stay above the consistency median after two macro events.",
    supporters: 970,
  },
];

// ── Competition desk definitions ────────────────────────────────────────────

const COMPETITION_DESKS = [
  {
    id: "crypto-apex-desk",
    cupId: "crypto",
    name: "Apex Desk",
    tier: "Premier",
    motto: "Alpha extraction at scale.",
    captainMission:
      "Lead the desk in weekly volume without breaching drawdown.",
    supporters: 0,
  },
  {
    id: "crypto-impulse-desk",
    cupId: "crypto",
    name: "Impulse Desk",
    tier: "Challenger",
    motto: "Fast conviction, fast exits.",
    captainMission: "Close three profitable sessions in a row.",
    supporters: 0,
  },
  {
    id: "forex-orbit-desk",
    cupId: "forex",
    name: "Orbit Desk",
    tier: "Premier",
    motto: "Session discipline wins.",
    captainMission: "Cover London and NY opens with positive returns.",
    supporters: 0,
  },
  {
    id: "forex-precision-desk",
    cupId: "forex",
    name: "Precision Desk",
    tier: "Challenger",
    motto: "Clean entries, clean exits.",
    captainMission: "Maintain above-median win rate across the week.",
    supporters: 0,
  },
  {
    id: "metals-vault-desk",
    cupId: "metals",
    name: "Vault Desk",
    tier: "Premier",
    motto: "Patience pays in gold.",
    captainMission: "Hold through macro events without panic closes.",
    supporters: 0,
  },
  {
    id: "energy-macro-desk",
    cupId: "energy",
    name: "Macro Desk",
    tier: "Premier",
    motto: "Event-driven edge.",
    captainMission: "Capture OPEC and inventory windows profitably.",
    supporters: 0,
  },
  {
    id: "multi-alpha-desk",
    cupId: "crypto",
    name: "Alpha Desk",
    tier: "Premier",
    motto: "Cross-asset conviction.",
    captainMission: "Trade three asset classes profitably in one week.",
    supporters: 0,
  },
  {
    id: "multi-rotation-desk",
    cupId: "forex",
    name: "Rotation Desk",
    tier: "Challenger",
    motto: "Rotate where edge lives.",
    captainMission: "Switch focus markets mid-week and stay positive.",
    supporters: 0,
  },
];

const DESK_IDS = COMPETITION_DESKS.map((d) => d.id);

// ── Static World Cup traders (the original 12) ─────────────────────────────

const STATIC_WORLDCUP_TRADERS = [
  {
    id: "crypto-reyes",
    name: "Mila Reyes",
    alias: "TapePilot",
    specialization: "crypto",
    tag: "Breakout sniper",
    bio: "Aggressive event trader who still protects her downside.",
    baseline: {
      riskAdjustedPnl: 82,
      consistency: 74,
      missionProgress: 68,
      streakPower: 71,
      raffleBonus: 55,
      weeklyVolume: 212000,
      tradeCount: 36,
      maxSingleTradeShare: 27,
      activeDays: 6,
      streakDays: 8,
      realizedPnl: 18400,
      drawdown: 4.2,
      raffleTickets: 8,
    },
    scenarioOverrides: {
      finals: {
        missionProgress: 76,
        consistency: 81,
        streakPower: 78,
        realizedPnl: 23600,
      },
    },
  },
  {
    id: "crypto-wu",
    name: "Jonah Wu",
    alias: "GammaFold",
    specialization: "crypto",
    tag: "Momentum scalper",
    bio: "Fast hands on crypto trend shifts with good session discipline.",
    baseline: {
      riskAdjustedPnl: 76,
      consistency: 70,
      missionProgress: 73,
      streakPower: 66,
      raffleBonus: 58,
      weeklyVolume: 189000,
      tradeCount: 42,
      maxSingleTradeShare: 31,
      activeDays: 6,
      streakDays: 6,
      realizedPnl: 16200,
      drawdown: 5.1,
      raffleTickets: 9,
    },
    scenarioOverrides: { bubble: { missionProgress: 79, consistency: 73 } },
  },
  {
    id: "crypto-ibrahim",
    name: "Amina Ibrahim",
    alias: "MeanRevert",
    specialization: "crypto",
    tag: "Controlled contrarian",
    bio: "Prefers cleaner setups and edges out rivals with drawdown control.",
    baseline: {
      riskAdjustedPnl: 71,
      consistency: 81,
      missionProgress: 64,
      streakPower: 72,
      raffleBonus: 61,
      weeklyVolume: 146000,
      tradeCount: 28,
      maxSingleTradeShare: 22,
      activeDays: 5,
      streakDays: 7,
      realizedPnl: 12700,
      drawdown: 3.4,
      raffleTickets: 10,
    },
  },
  {
    id: "metals-okoro",
    name: "Tega Okoro",
    alias: "BullionDesk",
    specialization: "metals",
    tag: "Macro specialist",
    bio: "Wins on patience and cleaner trade distribution.",
    baseline: {
      riskAdjustedPnl: 79,
      consistency: 84,
      missionProgress: 66,
      streakPower: 74,
      raffleBonus: 49,
      weeklyVolume: 154000,
      tradeCount: 24,
      maxSingleTradeShare: 24,
      activeDays: 5,
      streakDays: 9,
      realizedPnl: 13100,
      drawdown: 2.8,
      raffleTickets: 7,
    },
    scenarioOverrides: { finals: { consistency: 89, streakPower: 79 } },
  },
  {
    id: "metals-kim",
    name: "Sora Kim",
    alias: "SilverTape",
    specialization: "metals",
    tag: "Session grinder",
    bio: "Turns stable metals sessions into weekly points accumulation.",
    baseline: {
      riskAdjustedPnl: 73,
      consistency: 79,
      missionProgress: 77,
      streakPower: 70,
      raffleBonus: 57,
      weeklyVolume: 138000,
      tradeCount: 23,
      maxSingleTradeShare: 28,
      activeDays: 6,
      streakDays: 7,
      realizedPnl: 11600,
      drawdown: 3.3,
      raffleTickets: 9,
    },
  },
  {
    id: "metals-garcia",
    name: "Luis Garcia",
    alias: "MacroAnvil",
    specialization: "metals",
    tag: "Drawdown crusher",
    bio: "Lower upside, excellent eligibility profile, survives every week.",
    baseline: {
      riskAdjustedPnl: 68,
      consistency: 85,
      missionProgress: 61,
      streakPower: 75,
      raffleBonus: 63,
      weeklyVolume: 119000,
      tradeCount: 20,
      maxSingleTradeShare: 19,
      activeDays: 5,
      streakDays: 10,
      realizedPnl: 9200,
      drawdown: 2.4,
      raffleTickets: 11,
    },
  },
  {
    id: "energy-rhodes",
    name: "Nadia Rhodes",
    alias: "RefineryRun",
    specialization: "energy",
    tag: "Event window hunter",
    bio: "Built for volatility spikes without losing structure.",
    baseline: {
      riskAdjustedPnl: 84,
      consistency: 68,
      missionProgress: 72,
      streakPower: 64,
      raffleBonus: 54,
      weeklyVolume: 228000,
      tradeCount: 39,
      maxSingleTradeShare: 34,
      activeDays: 6,
      streakDays: 5,
      realizedPnl: 20500,
      drawdown: 6.2,
      raffleTickets: 8,
    },
  },
  {
    id: "energy-ndiaye",
    name: "Oumar Ndiaye",
    alias: "OPECWatch",
    specialization: "energy",
    tag: "Structured discretionary",
    bio: "Turns news windows into repeatable edge with consistent participation.",
    baseline: {
      riskAdjustedPnl: 77,
      consistency: 76,
      missionProgress: 74,
      streakPower: 73,
      raffleBonus: 58,
      weeklyVolume: 201000,
      tradeCount: 35,
      maxSingleTradeShare: 29,
      activeDays: 6,
      streakDays: 7,
      realizedPnl: 16800,
      drawdown: 4.9,
      raffleTickets: 9,
    },
  },
  {
    id: "energy-holt",
    name: "Casey Holt",
    alias: "VolGrid",
    specialization: "energy",
    tag: "High conviction",
    bio: "Big weeks when right, but closer to the integrity thresholds.",
    baseline: {
      riskAdjustedPnl: 81,
      consistency: 59,
      missionProgress: 63,
      streakPower: 58,
      raffleBonus: 43,
      weeklyVolume: 176000,
      tradeCount: 18,
      maxSingleTradeShare: 52,
      activeDays: 4,
      streakDays: 3,
      realizedPnl: 21400,
      drawdown: 9.3,
      raffleTickets: 6,
    },
    manualFlags: {
      integrity: [
        {
          code: "single-trade-share",
          label: "Single trade share",
          severity: "medium",
          reason:
            "More than half of total performance came from one oversized trade.",
        },
      ],
    },
  },
  {
    id: "forex-owens",
    name: "Priya Owens",
    alias: "LondonFix",
    specialization: "forex",
    tag: "Session tactician",
    bio: "Most balanced trader in the field with strong day-to-day cadence.",
    baseline: {
      riskAdjustedPnl: 75,
      consistency: 86,
      missionProgress: 73,
      streakPower: 82,
      raffleBonus: 59,
      weeklyVolume: 191000,
      tradeCount: 31,
      maxSingleTradeShare: 21,
      activeDays: 6,
      streakDays: 11,
      realizedPnl: 14800,
      drawdown: 3.1,
      raffleTickets: 10,
    },
  },
  {
    id: "forex-lim",
    name: "Darren Lim",
    alias: "CarryFade",
    specialization: "forex",
    tag: "Macro swing trader",
    bio: "Wins through cleaner macro holds rather than hyperactivity.",
    baseline: {
      riskAdjustedPnl: 72,
      consistency: 80,
      missionProgress: 69,
      streakPower: 71,
      raffleBonus: 62,
      weeklyVolume: 165000,
      tradeCount: 26,
      maxSingleTradeShare: 26,
      activeDays: 5,
      streakDays: 8,
      realizedPnl: 11900,
      drawdown: 3.7,
      raffleTickets: 10,
    },
  },
  {
    id: "forex-adeyemi",
    name: "Kemi Adeyemi",
    alias: "TokyoCross",
    specialization: "forex",
    tag: "News release sniper",
    bio: "Strong upside, slightly less consistent than the best cadence players.",
    baseline: {
      riskAdjustedPnl: 78,
      consistency: 72,
      missionProgress: 70,
      streakPower: 67,
      raffleBonus: 56,
      weeklyVolume: 174000,
      tradeCount: 29,
      maxSingleTradeShare: 30,
      activeDays: 5,
      streakDays: 6,
      realizedPnl: 15700,
      drawdown: 5.2,
      raffleTickets: 8,
    },
  },
];

// ── Trader generation pools (same as lib/world-cup/traders.ts) ──────────────

const WC_FIRST_NAMES = [
  "Alex",
  "Jordan",
  "Sam",
  "Blake",
  "Casey",
  "Drew",
  "Kai",
  "Ren",
  "Finn",
  "Sage",
  "Quinn",
  "Ash",
  "River",
  "Skyler",
  "Rowan",
  "Avery",
  "Emery",
  "Hayden",
  "Lennox",
  "Morgan",
  "Reese",
  "Taylor",
  "Devon",
  "Harley",
  "Jesse",
  "Lane",
  "Micah",
  "Noel",
  "Parker",
  "Reed",
  "Shay",
  "Val",
  "Wren",
  "Yael",
  "Zion",
  "Ari",
  "Cam",
  "Ellis",
  "Gray",
  "Hunter",
  "Indigo",
  "Jae",
  "Kit",
  "Lux",
  "Marin",
];
const WC_LAST_NAMES = [
  "Chen",
  "Nakamura",
  "Osei",
  "Petrova",
  "Reeves",
  "Santos",
  "Takeda",
  "Uribe",
  "Varga",
  "Walsh",
  "Xu",
  "Yamamoto",
  "Zhao",
  "Bakshi",
  "Cortez",
  "Dahl",
  "Evers",
  "Frost",
  "Gupta",
  "Hart",
  "Ismail",
  "Joshi",
  "Klein",
  "Larsen",
  "Moto",
  "Ng",
  "Ortiz",
  "Park",
  "Rao",
  "Sato",
  "Torres",
  "Ulrich",
  "Volkov",
  "Weber",
  "Yilmaz",
];
const WC_ALIAS_PREFIXES = [
  "Alpha",
  "Beta",
  "Gamma",
  "Delta",
  "Omega",
  "Sigma",
  "Theta",
  "Zeta",
  "Kappa",
  "Nova",
  "Pulse",
  "Edge",
  "Flow",
  "Grid",
  "Flux",
  "Drift",
  "Surge",
  "Void",
  "Peak",
  "Core",
  "Apex",
  "Iron",
  "Steel",
  "Storm",
  "Flash",
  "Blitz",
  "Sharp",
  "Swift",
  "Bolt",
  "Arc",
];
const WC_ALIAS_SUFFIXES = [
  "Desk",
  "Tape",
  "Run",
  "Trade",
  "Grid",
  "Flow",
  "Edge",
  "Shot",
  "Wire",
  "Link",
  "Sync",
  "Wave",
  "Vault",
  "Port",
  "Node",
  "Axis",
  "Gate",
  "Lock",
  "Chain",
  "Stack",
  "Spark",
  "Drift",
  "Beam",
  "Cast",
];
const WC_TAGS = [
  "Trend follower",
  "Range trader",
  "Scalp artist",
  "Swing specialist",
  "Breakout hunter",
  "Momentum rider",
  "Mean reversion",
  "News trader",
  "Session player",
  "Macro caller",
  "Pattern sniper",
  "Volume tracker",
  "Risk manager",
  "Event trader",
  "Contrarian play",
  "Overnight hold",
  "Gap trader",
  "Fade specialist",
  "Dip buyer",
  "Rally surfer",
];
const WC_BIOS: Record<string, string[]> = {
  crypto: [
    "Reads tape flow on majors and memes with tight risk control.",
    "Event-driven trades with strong position sizing discipline.",
    "Momentum plays on altcoins backed by volume confirmation.",
    "Scalps BTC and SOL sessions with consistent daily returns.",
    "Catches trend shifts early and manages drawdown aggressively.",
  ],
  metals: [
    "Macro-driven positions in gold with patient holding periods.",
    "Session grinder who turns XAU/XAG ranges into weekly edge.",
    "Consistent accumulator with focus on risk-adjusted returns.",
    "Trades macro catalysts with structured entry and exit rules.",
    "Low-volatility approach to metals with clean trade distribution.",
  ],
  energy: [
    "Catches OPEC-driven volatility windows with tactical sizing.",
    "Structured approach to energy markets with event-window focus.",
    "High-conviction plays on WTI with controlled drawdown.",
    "Reads supply-demand dynamics for directional energy trades.",
    "Combines technical and fundamental edge in volatile markets.",
  ],
  forex: [
    "Session-based trader with strong London and Tokyo coverage.",
    "Macro swing positions on major pairs with weekly rebalancing.",
    "Precision entries on news releases with tight stop management.",
    "Carry trade specialist with consistent daily return profile.",
    "Session tactician with strong cadence across time zones.",
  ],
};
const WC_DIVISION_RANGES: Record<
  string,
  {
    raroiBase: number;
    raroiSpread: number;
    consistBase: number;
    consistSpread: number;
    volumeBase: number;
    volumeSpread: number;
    tradeBase: number;
    tradeSpread: number;
  }
> = {
  // crypto: volatile pool — wide talent spectrum from raw underdogs to elite tape readers
  crypto: {
    raroiBase: 40,
    raroiSpread: 55,
    consistBase: 38,
    consistSpread: 55,
    volumeBase: 120000,
    volumeSpread: 180000,
    tradeBase: 12,
    tradeSpread: 40,
  },
  // metals: steadier market, consistency differentiates — still broad range but tighter extremes
  metals: {
    raroiBase: 46,
    raroiSpread: 46,
    consistBase: 52,
    consistSpread: 42,
    volumeBase: 90000,
    volumeSpread: 140000,
    tradeBase: 10,
    tradeSpread: 30,
  },
  // energy: highest event-driven volatility — biggest spread, most upsets
  energy: {
    raroiBase: 38,
    raroiSpread: 58,
    consistBase: 36,
    consistSpread: 58,
    volumeBase: 130000,
    volumeSpread: 180000,
    tradeBase: 10,
    tradeSpread: 38,
  },
  // forex: balanced session specialists — moderate spread, reliable middle tier
  forex: {
    raroiBase: 44,
    raroiSpread: 48,
    consistBase: 50,
    consistSpread: 44,
    volumeBase: 100000,
    volumeSpread: 160000,
    tradeBase: 10,
    tradeSpread: 36,
  },
};

const QUEST_IDS = [
  "challenge-volume",
  "positive-sessions",
  "win-streak-3",
  "first-trade",
  "top-10-finish",
];

const BEAT_TYPES = [
  {
    type: "lead_change",
    headlines: [
      "Lead changes hands!",
      "New leader emerges on the board",
      "Upset at the top of the leaderboard",
    ],
  },
  {
    type: "milestone",
    headlines: [
      "$100K volume milestone reached",
      "10-trade milestone hit",
      "Consistency score breaks 90",
    ],
  },
  {
    type: "streak",
    headlines: [
      "5-day trading streak!",
      "Streak broken after 8 days",
      "Warning: streak at risk",
    ],
  },
  {
    type: "sybil_alert",
    headlines: [
      "Suspicious activity flagged",
      "Pattern correlation detected",
      "Manual review triggered",
    ],
  },
  {
    type: "cohort_update",
    headlines: [
      "Cohort entering final hours",
      "Halfway through the challenge",
      "New enrollments surging",
    ],
  },
];

// ── Seed functions ───────────────────────────────────────────────────────────

async function resetDatabase() {
  console.log("  Resetting database...");
  await prisma.sybilAuditLog.deleteMany();
  await prisma.sybilFlag.deleteMany();
  await prisma.narrativeBeat.deleteMany();
  await prisma.equitySnapshot.deleteMany();
  await prisma.tradeEvent.deleteMany();
  await prisma.dailyMissionResult.deleteMany();
  await prisma.dailyMission.deleteMany();
  await prisma.spectatorVote.deleteMany();
  await prisma.worldCupMatch.deleteMany();
  await prisma.worldCupGroup.deleteMany();
  await prisma.worldCupSeason.deleteMany();
  await prisma.deskMembership.deleteMany();
  await prisma.streakState.deleteMany();
  await prisma.questProgress.deleteMany();
  await prisma.traderScore.deleteMany();
  await prisma.enrollment.deleteMany();
  await prisma.raffleEntry.deleteMany();
  await prisma.competitionResult.deleteMany();
  await prisma.cohort.deleteMany();
  await prisma.worldCupTrader.deleteMany();
  await prisma.desk.deleteMany();
  console.log("  → All tables cleared");
}

async function seedCohorts() {
  console.log("  Cohorts...");
  let count = 0;
  for (const c of cohortsData.cohorts) {
    await prisma.cohort.create({
      data: {
        id: c.id,
        name: c.name,
        presetId: c.presetId,
        state: c.state,
        startTime: new Date(c.startTime),
        endTime: new Date(c.endTime),
        narrative: c.narrative ?? "",
        rewardPoolUsd: c.rewardPoolUsd,
        entryFeeUsd: c.entryFeeUsd,
        participantCap: c.participantCap,
        specialistType: c.specialistType ?? null,
        scoringMode: c.scoringMode ?? null,
      },
    });
    count++;
  }
  console.log(`  → ${count} cohorts seeded from competition-cohorts.json`);
}

async function seedEnrollments() {
  console.log("  Enrollments...");
  let count = 0;
  let walletIdx = 0;

  for (const cohort of COHORTS) {
    const rng = createRng(hashStr(cohort.id));
    for (let i = 0; i < cohort.walletCount && walletIdx < WALLETS.length; i++) {
      const wallet = WALLETS[walletIdx % WALLETS.length];
      const startingEquity =
        cohort.state === "upcoming"
          ? null
          : Number((500 + rng() * 9500).toFixed(2));

      await prisma.enrollment.create({
        data: {
          wallet,
          cohortId: cohort.id,
          startingEquity,
          enrolledAt: new Date(
            new Date(cohort.startTime).getTime() - rng() * 86_400_000
          ),
        },
      });
      walletIdx++;
      count++;
    }
  }
  console.log(`  → ${count} enrollments`);
}

async function seedTraderScores() {
  console.log("  Trader scores...");
  let count = 0;
  let walletIdx = 0;

  for (const cohort of COHORTS) {
    if (cohort.state === "upcoming") {
      walletIdx += cohort.walletCount;
      continue;
    }

    const rng = createRng(hashStr(`scores-${cohort.id}`));
    for (let i = 0; i < cohort.walletCount && walletIdx < WALLETS.length; i++) {
      const wallet = WALLETS[walletIdx % WALLETS.length];
      const pnlPercent = Number((-5 + rng() * 35).toFixed(1));
      const volumeUsd = Math.round(20000 + rng() * 280000);
      const winRate = Number((35 + rng() * 35).toFixed(1));
      const consistencyScore = Number((40 + rng() * 55).toFixed(1));
      const maxDrawdownPercent = Number((0.5 + rng() * 12).toFixed(1));
      const tradeCount = Math.round(3 + rng() * 45);
      const activeDays = Math.round(1 + rng() * 6);

      const w = cohortsData.config.scoringWeights;
      const tournamentScore = Number(
        (
          pnlPercent * w.pnlPercent +
          Math.log10(volumeUsd + 1) * w.volumeUsd +
          consistencyScore * w.consistency +
          winRate * w.winRate -
          maxDrawdownPercent * w.drawdownPenalty
        ).toFixed(2)
      );

      await prisma.traderScore.create({
        data: {
          wallet,
          cohortId: cohort.id,
          tournamentScore,
          pnlPercent,
          volumeUsd,
          winRate,
          consistencyScore,
          maxDrawdownPercent,
          tradeCount,
          activeDays,
        },
      });
      walletIdx++;
      count++;
    }
  }
  console.log(`  → ${count} trader scores`);
}

async function seedQuestProgress() {
  console.log("  Quest progress...");
  let count = 0;
  const rng = createRng(hashStr("quests"));

  for (let i = 0; i < Math.min(20, WALLETS.length); i++) {
    const wallet = WALLETS[i];
    for (const questId of QUEST_IDS) {
      if (rng() < 0.4) continue; // not every wallet has every quest
      const target =
        questId === "challenge-volume"
          ? 200
          : questId === "positive-sessions"
            ? 6
            : 1;
      const progress = Math.min(target, Math.round(rng() * target * 1.2));
      const completed = progress >= target;

      await prisma.questProgress.create({
        data: {
          wallet,
          questId,
          progress,
          completedAt: completed
            ? new Date(Date.now() - rng() * 3 * 86_400_000)
            : null,
        },
      });
      count++;
    }
  }
  console.log(`  → ${count} quest progress entries`);
}

async function seedStreaks() {
  console.log("  Streak states...");
  const rng = createRng(hashStr("streaks"));
  let count = 0;

  for (let i = 0; i < Math.min(20, WALLETS.length); i++) {
    const wallet = WALLETS[i];
    const streakDays = Math.round(rng() * 14);
    const daysAgo = Math.round(rng() * 3);
    const lastDate = new Date(Date.now() - daysAgo * 86_400_000)
      .toISOString()
      .slice(0, 10);

    await prisma.streakState.create({
      data: { wallet, streakDays, lastActivityDate: lastDate },
    });
    count++;
  }
  console.log(`  → ${count} streak states`);
}

async function seedDeskMemberships() {
  console.log("  Desk memberships...");
  let count = 0;

  for (let i = 0; i < WALLETS.length; i++) {
    const wallet = WALLETS[i];
    const deskId = DESK_IDS[i % DESK_IDS.length];
    const role = i < DESK_IDS.length ? "captain" : "member";

    await prisma.deskMembership.create({
      data: { deskId, wallet, role },
    });
    count++;
  }
  console.log(`  → ${count} desk memberships`);
}

async function seedWorldCup() {
  console.log("  World Cup season...");
  const now = new Date();
  const seasonEnd = new Date(now.getTime() + 14 * 86_400_000);

  const season = await prisma.worldCupSeason.create({
    data: {
      id: "seed-season-1",
      cupId: "crypto",
      state: "active",
      startTime: now,
      endTime: seasonEnd,
    },
  });

  const groupNames = ["Group A", "Group B", "Group C", "Group D"];
  for (let g = 0; g < groupNames.length; g++) {
    const groupWallets = WALLETS.filter((_, i) => i % 4 === g).slice(0, 4);
    await prisma.worldCupGroup.create({
      data: {
        seasonId: season.id,
        groupName: groupNames[g],
        wallets: groupWallets,
      },
    });
  }

  // Create group-stage matches
  let matchCount = 0;
  for (let g = 0; g < groupNames.length; g++) {
    const groupWallets = WALLETS.filter((_, i) => i % 4 === g).slice(0, 4);
    for (let a = 0; a < groupWallets.length; a++) {
      for (let b = a + 1; b < groupWallets.length; b++) {
        await prisma.worldCupMatch.create({
          data: {
            seasonId: season.id,
            round: "group",
            traderA: groupWallets[a],
            traderB: groupWallets[b],
            scheduledAt: new Date(now.getTime() + (matchCount + 1) * 3_600_000),
          },
        });
        matchCount++;
      }
    }
  }
  console.log(
    `  → 1 season, ${groupNames.length} groups, ${matchCount} matches`
  );
}

async function seedDailyMissions() {
  console.log("  Daily missions...");
  const today = new Date().toISOString().slice(0, 10);
  const missionTypes = [
    "best_roi_today",
    "most_trades_today",
    "highest_volume_today",
  ];
  let count = 0;

  for (const cohort of COHORTS.filter((c) => c.state === "live")) {
    for (const missionType of missionTypes) {
      await prisma.dailyMission.create({
        data: { date: today, missionType, cohortId: cohort.id },
      });
      count++;
    }
  }
  console.log(`  → ${count} daily missions`);
}

async function seedTradeEvents() {
  console.log("  Trade events...");
  const rng = createRng(hashStr("trades"));
  let count = 0;

  for (let w = 0; w < Math.min(20, WALLETS.length); w++) {
    const wallet = WALLETS[w];
    const numTrades = Math.round(5 + rng() * 20);

    for (let t = 0; t < numTrades; t++) {
      const isLong = rng() > 0.45;
      const sizeUsd = Number((100 + rng() * 15000).toFixed(2));
      const price = Number((0.5 + rng() * 200).toFixed(4));
      const collateralUsd = Number((sizeUsd * (0.05 + rng() * 0.3)).toFixed(2));
      const netPnl = Number((-500 + rng() * 1500).toFixed(2));
      const profitUsd = netPnl > 0 ? netPnl : 0;
      const lossUsd = netPnl < 0 ? Math.abs(netPnl) : 0;
      const borrowFeeUsd = Number((rng() * 5).toFixed(2));
      const exitFeeUsd = Number((sizeUsd * 0.001).toFixed(2));
      const closedAt = new Date(Date.now() - rng() * 7 * 86_400_000);
      const positionId = `pos-${wallet.slice(0, 6)}-${t}`;

      await prisma.tradeEvent.create({
        data: {
          wallet,
          positionPubkey: `${wallet.slice(0, 8)}${t}pos`,
          custodyMint: CUSTODY_MINTS[Math.floor(rng() * CUSTODY_MINTS.length)],
          side: isLong ? "long" : "short",
          sizeUsd,
          price,
          collateralUsd,
          profitUsd,
          lossUsd,
          netPnl,
          borrowFeeUsd,
          exitFeeUsd,
          positionId,
          percentageClosed: "100",
          closedAt,
        },
      });
      count++;
    }
  }
  console.log(`  → ${count} trade events`);
}

async function seedEquitySnapshots() {
  console.log("  Equity snapshots...");
  const rng = createRng(hashStr("equity"));
  let count = 0;
  let walletIdx = 0;

  for (const cohort of COHORTS) {
    if (cohort.state === "upcoming") {
      walletIdx += cohort.walletCount;
      continue;
    }

    const start = new Date(cohort.startTime).getTime();
    const end = Math.min(Date.now(), new Date(cohort.endTime).getTime());
    const hours = Math.round((end - start) / 3_600_000);

    for (let i = 0; i < Math.min(5, cohort.walletCount); i++) {
      const wallet = WALLETS[walletIdx % WALLETS.length];
      let equity = 1000 + rng() * 9000;

      for (let h = 0; h < hours; h += 4) {
        equity *= 0.97 + rng() * 0.06; // -3% to +3% per 4h
        await prisma.equitySnapshot.create({
          data: {
            wallet,
            cohortId: cohort.id,
            equity: Number(equity.toFixed(2)),
            snapshotAt: new Date(start + h * 3_600_000),
          },
        });
        count++;
      }
      walletIdx++;
    }
    walletIdx += Math.max(0, cohort.walletCount - 5);
  }
  console.log(`  → ${count} equity snapshots`);
}

async function seedNarrativeBeats() {
  console.log("  Narrative beats...");
  const rng = createRng(hashStr("beats"));
  let count = 0;

  for (const cohort of COHORTS.filter((c) => c.state === "live")) {
    const numBeats = 5 + Math.round(rng() * 10);
    for (let b = 0; b < numBeats; b++) {
      const beatType = BEAT_TYPES[Math.floor(rng() * BEAT_TYPES.length)];
      const headline =
        beatType.headlines[Math.floor(rng() * beatType.headlines.length)];
      const severity = beatType.type === "sybil_alert" ? "warning" : "info";

      await prisma.narrativeBeat.create({
        data: {
          cohortId: cohort.id,
          type: beatType.type,
          headline,
          subtext: rng() > 0.5 ? `Cohort: ${cohort.name}` : null,
          severity,
          createdAt: new Date(Date.now() - rng() * 48 * 3_600_000),
        },
      });
      count++;
    }
  }
  console.log(`  → ${count} narrative beats`);
}

async function seedSybilFlags() {
  console.log("  Sybil flags...");
  const rng = createRng(hashStr("sybil"));
  let count = 0;

  for (const cohort of COHORTS.filter((c) => c.state === "live")) {
    // Flag ~10% of wallets in each live cohort
    for (let i = 0; i < WALLETS.length; i++) {
      if (rng() > 0.1) continue;
      const wallet = WALLETS[i];
      const flagCodes = [
        "funding_cluster",
        "pnl_mirror",
        "pattern_correlation",
      ];
      const flagCode = flagCodes[Math.floor(rng() * flagCodes.length)];

      await prisma.sybilFlag.create({
        data: {
          wallet,
          cohortId: cohort.id,
          flagCode,
          reason: `Automated detection: ${flagCode.replace(/_/g, " ")}`,
          confidence: rng() > 0.5 ? "high" : "medium",
        },
      });
      count++;
    }
  }
  console.log(`  → ${count} sybil flags`);
}

async function seedDesks() {
  console.log("  Desks...");
  const allDesks = [...WORLDCUP_DESKS, ...COMPETITION_DESKS];
  let count = 0;

  for (const desk of allDesks) {
    await prisma.desk.create({ data: desk });
    count++;
  }
  console.log(`  → ${count} desks`);
}

function generateWorldCupTraders(division: string, count: number) {
  const rng = createRng(hashStr(`${division}-pool`));
  const ranges = WC_DIVISION_RANGES[division];
  const divBios = WC_BIOS[division];
  const generated: typeof STATIC_WORLDCUP_TRADERS = [];

  for (let i = 0; i < count; i++) {
    const firstIdx = Math.floor(rng() * WC_FIRST_NAMES.length);
    const lastIdx = Math.floor(rng() * WC_LAST_NAMES.length);
    const prefixIdx = Math.floor(rng() * WC_ALIAS_PREFIXES.length);
    const suffixIdx = Math.floor(rng() * WC_ALIAS_SUFFIXES.length);
    const tagIdx = Math.floor(rng() * WC_TAGS.length);
    const bioIdx = Math.floor(rng() * divBios.length);

    const name = `${WC_FIRST_NAMES[firstIdx]} ${WC_LAST_NAMES[lastIdx]}`;
    const alias = `${WC_ALIAS_PREFIXES[prefixIdx]}${WC_ALIAS_SUFFIXES[suffixIdx]}`;
    const raroi = Math.round(ranges.raroiBase + rng() * ranges.raroiSpread);
    const consist = Math.round(
      ranges.consistBase + rng() * ranges.consistSpread
    );
    const mission = Math.round(50 + rng() * 40);
    const streak = Math.round(45 + rng() * 40);
    const raffle = Math.round(35 + rng() * 40);
    const volume = Math.round(ranges.volumeBase + rng() * ranges.volumeSpread);
    const trades = Math.round(ranges.tradeBase + rng() * ranges.tradeSpread);
    const maxShare = Math.round(15 + rng() * 35);
    const active = Math.min(7, Math.round(3 + rng() * 4));
    const streakDays = Math.round(2 + rng() * 10);
    const pnl = Math.round(5000 + rng() * 20000);
    const drawdown = Number((1.5 + rng() * 8).toFixed(1));
    const tickets = Math.round(3 + rng() * 12);

    generated.push({
      id: `${division}-gen-${i}`,
      name,
      alias,
      specialization: division,
      tag: WC_TAGS[tagIdx],
      bio: divBios[bioIdx],
      baseline: {
        riskAdjustedPnl: Math.min(100, raroi),
        consistency: Math.min(100, consist),
        missionProgress: Math.min(100, mission),
        streakPower: Math.min(100, streak),
        raffleBonus: Math.min(100, raffle),
        weeklyVolume: volume,
        tradeCount: trades,
        maxSingleTradeShare: maxShare,
        activeDays: active,
        streakDays,
        realizedPnl: pnl,
        drawdown,
        raffleTickets: tickets,
      },
    });
  }
  return generated;
}

async function seedWorldCupTraders() {
  console.log("  World Cup traders...");
  let count = 0;
  const divisions = ["crypto", "metals", "energy", "forex"] as const;

  // Seed static traders first
  for (const trader of STATIC_WORLDCUP_TRADERS) {
    await prisma.worldCupTrader.create({
      data: {
        id: trader.id,
        name: trader.name,
        alias: trader.alias,
        specialization: trader.specialization,
        tag: trader.tag,
        bio: trader.bio,
        baseline: trader.baseline,
        scenarioOverrides:
          ((trader as Record<string, unknown>).scenarioOverrides as object) ??
          undefined,
        manualFlags:
          ((trader as Record<string, unknown>).manualFlags as object) ??
          undefined,
      },
    });
    count++;
  }

  // Generate remaining traders per division
  for (const division of divisions) {
    const needed = 29; // 29 generated + existing static + 1 viewer slot = 32
    const generated = generateWorldCupTraders(division, needed);

    for (const trader of generated) {
      await prisma.worldCupTrader.create({
        data: {
          id: trader.id,
          name: trader.name,
          alias: trader.alias,
          specialization: trader.specialization,
          tag: trader.tag,
          bio: trader.bio,
          baseline: trader.baseline,
        },
      });
      count++;
    }
  }
  console.log(`  → ${count} world cup traders`);
}

async function seedRaffleEntries() {
  console.log("  Raffle entries...");
  const rng = createRng(hashStr("raffle"));
  let count = 0;

  for (const cohort of COHORTS.filter((c) => c.state === "live")) {
    for (let i = 0; i < Math.min(cohort.walletCount, WALLETS.length); i++) {
      const tickets = 1 + (i % 3);
      await prisma.raffleEntry.create({
        data: {
          wallet: WALLETS[i],
          cohortId: cohort.id,
          tickets,
          source: rng() > 0.5 ? "quest" : "streak",
        },
      });
      count++;
    }
  }
  console.log(`  → ${count} raffle entries`);
}

async function seedDailyMissionResults() {
  console.log("  Daily mission results...");
  const today = new Date().toISOString().slice(0, 10);
  const missions = await prisma.dailyMission.findMany({
    where: { date: today },
  });
  let count = 0;

  for (const mission of missions) {
    for (let rank = 1; rank <= 3; rank++) {
      const wallet = WALLETS[(rank - 1) % WALLETS.length];
      await prisma.dailyMissionResult.create({
        data: {
          missionId: mission.id,
          wallet,
          cohortId: mission.cohortId,
          value: Number((100 - rank * 10 + Math.random() * 5).toFixed(2)),
          rank,
        },
      });
      count++;
    }
  }
  console.log(`  → ${count} daily mission results`);
}

async function seedSpectatorVotes() {
  console.log("  Spectator votes...");
  const matches = await prisma.worldCupMatch.findMany();
  const rng = createRng(hashStr("votes"));
  let count = 0;

  for (const match of matches) {
    const voterCount = 2 + Math.floor(rng() * 4);
    for (let v = 0; v < voterCount && v < WALLETS.length; v++) {
      const votedFor = rng() > 0.5 ? match.traderA : match.traderB;
      await prisma.spectatorVote.create({
        data: { matchId: match.id, voterWallet: WALLETS[v], votedFor },
      });
      count++;
    }
  }
  console.log(`  → ${count} spectator votes`);
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function seed() {
  console.log("Seeding database...\n");

  await resetDatabase();
  await seedCohorts();
  await seedDesks();
  await seedWorldCupTraders();
  await seedEnrollments();
  await seedTraderScores();
  await seedQuestProgress();
  await seedStreaks();
  await seedDeskMemberships();
  await seedWorldCup();
  await seedDailyMissions();
  await seedDailyMissionResults();
  await seedRaffleEntries();
  await seedTradeEvents();
  await seedEquitySnapshots();
  await seedNarrativeBeats();
  await seedSybilFlags();
  await seedSpectatorVotes();

  console.log("\nSeed complete!");
}

seed()
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
