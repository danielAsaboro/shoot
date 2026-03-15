import type { CupDefinition } from "./types.ts";

export const cups: CupDefinition[] = [
  {
    id: "crypto",
    name: "Crypto Cup",
    badge: "CR",
    strapline: "High beta, fast rotations, visible conviction.",
    narrative:
      "The pure momentum arena for majors, memes, and event-driven trades.",
    finalsSlots: 2,
    markets: ["BTC", "ETH", "SOL", "JTO", "BONK"],
    missions: [
      {
        id: "crypto-open",
        title: "Opening Bell",
        summary: "Trade three unique crypto perps before the New York open.",
        points: 120,
        tickets: 2,
      },
      {
        id: "crypto-hedge",
        title: "Hedge Week",
        summary: "Finish two sessions green while keeping drawdown under 4%.",
        points: 180,
        tickets: 4,
      },
      {
        id: "crypto-finals",
        title: "Finals Qualifier",
        summary:
          "Post positive risk-adjusted PnL on two consecutive matchdays.",
        points: 220,
        tickets: 5,
      },
    ],
    rewards: [
      {
        label: "Cup Champion",
        range: "1st",
        payout: "4,000 USDC + Grand Finals seed",
        summary: "Headline placement, champion badge, and finals lane choice.",
      },
      {
        label: "Finals Qualifier",
        range: "2nd",
        payout: "2,250 USDC + Finals access",
        summary: "Guaranteed knockout slot with cup specialist cosmetics.",
      },
      {
        label: "Matchday Grinder",
        range: "3rd-6th",
        payout: "600 USDC + raffle multiplier",
        summary: "Keeps mid-table traders active throughout the season.",
      },
      {
        label: "Mission Hunter",
        range: "Any eligible finisher",
        payout: "Quests XP + ticket boost",
        summary: "Daily engagement path for non-elite traders.",
      },
    ],
  },
  {
    id: "metals",
    name: "Metals Cup",
    badge: "MT",
    strapline: "Precision over pace, conviction over noise.",
    narrative:
      "Gold and silver specialists play a longer, cleaner game around macro catalysts.",
    finalsSlots: 2,
    markets: ["XAU", "XAG"],
    missions: [
      {
        id: "metals-macro",
        title: "Macro Map",
        summary:
          "Hold a metals thesis across two sessions without breaching the loss cap.",
        points: 130,
        tickets: 2,
      },
      {
        id: "metals-steady",
        title: "Steady Hands",
        summary:
          "Log four active days with no single trade above the impact threshold.",
        points: 160,
        tickets: 4,
      },
      {
        id: "metals-close",
        title: "Closing Auction",
        summary: "End the week above the consistency median for the cup.",
        points: 210,
        tickets: 5,
      },
    ],
    rewards: [
      {
        label: "Cup Champion",
        range: "1st",
        payout: "4,000 USDC + Grand Finals seed",
        summary: "Reserved for the cleanest macro execution in the league.",
      },
      {
        label: "Finals Qualifier",
        range: "2nd",
        payout: "2,250 USDC + Finals access",
        summary: "Secures advancement with a consistency edge.",
      },
      {
        label: "Drawdown Master",
        range: "3rd-5th",
        payout: "700 USDC + streak boost",
        summary: "Rewards stable play, not just breakout PnL.",
      },
      {
        label: "Mission Hunter",
        range: "Any eligible finisher",
        payout: "Quests XP + ticket boost",
        summary: "Preserves engagement for steady participants.",
      },
    ],
  },
  {
    id: "energy",
    name: "Energy Cup",
    badge: "EN",
    strapline: "Volatility with structure.",
    narrative:
      "Oil and gas traders compete in the most tactical cup, where event timing matters.",
    finalsSlots: 2,
    markets: ["WTI", "Brent", "NatGas"],
    missions: [
      {
        id: "energy-surge",
        title: "Surge Capture",
        summary:
          "Participate in two event windows and keep average holding time disciplined.",
        points: 140,
        tickets: 3,
      },
      {
        id: "energy-risk",
        title: "Risk Desk",
        summary:
          "Trade four sessions with no liquidation events or oversized positions.",
        points: 170,
        tickets: 4,
      },
      {
        id: "energy-finals",
        title: "Refinery Run",
        summary: "Win both weekend matchdays on risk-adjusted PnL.",
        points: 240,
        tickets: 5,
      },
    ],
    rewards: [
      {
        label: "Cup Champion",
        range: "1st",
        payout: "4,000 USDC + Grand Finals seed",
        summary: "Earns the most volatile cup title and priority finals slot.",
      },
      {
        label: "Finals Qualifier",
        range: "2nd",
        payout: "2,250 USDC + Finals access",
        summary: "Locks qualification through tactical consistency.",
      },
      {
        label: "Refinery Runner",
        range: "3rd-6th",
        payout: "650 USDC + raffle multiplier",
        summary:
          "Rewards active traders who keep showing up for event windows.",
      },
      {
        label: "Mission Hunter",
        range: "Any eligible finisher",
        payout: "Quests XP + ticket boost",
        summary: "Converts participation into persistent rewards.",
      },
    ],
  },
  {
    id: "forex",
    name: "Forex Cup",
    badge: "FX",
    strapline: "Cadence, discipline, and macro tape reading.",
    narrative:
      "The identity cup for traders who want a daily rhythm and sharp execution around flows.",
    finalsSlots: 2,
    markets: ["EUR/USD", "GBP/USD", "USD/JPY"],
    missions: [
      {
        id: "forex-open",
        title: "London Open",
        summary:
          "Trade three London sessions and finish above the cup median twice.",
        points: 120,
        tickets: 2,
      },
      {
        id: "forex-calendar",
        title: "Macro Calendar",
        summary:
          "Navigate two news releases while keeping max drawdown below 5%.",
        points: 170,
        tickets: 4,
      },
      {
        id: "forex-finals",
        title: "Final Whistle",
        summary:
          "Close the week with positive consistency and mission completion.",
        points: 210,
        tickets: 5,
      },
    ],
    rewards: [
      {
        label: "Cup Champion",
        range: "1st",
        payout: "4,000 USDC + Grand Finals seed",
        summary: "Best macro tape reader advances as the cup face.",
      },
      {
        label: "Finals Qualifier",
        range: "2nd",
        payout: "2,250 USDC + Finals access",
        summary: "Advances through disciplined session-to-session play.",
      },
      {
        label: "Cadence Keeper",
        range: "3rd-6th",
        payout: "700 USDC + streak boost",
        summary: "Keeps steady traders meaningfully invested.",
      },
      {
        label: "Mission Hunter",
        range: "Any eligible finisher",
        payout: "Quests XP + ticket boost",
        summary: "Adds a daily reason to log back in.",
      },
    ],
  },
];
