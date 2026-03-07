export const designDocSections = [
  {
    title: "Format",
    items: [
      "Prop Challenge Hub runs rolling paid cohorts with preset-specific narratives, but one reusable rules engine.",
      "V1 resolves winners by relative ranking instead of hard pass/fail, which keeps the competition socially legible and always-on.",
      "Each cohort exposes entry cost, prize pool, funded-season upside, and eligibility status before enrollment.",
    ],
  },
  {
    title: "Scoring",
    items: [
      "Tournament score blends PnL, volume, consistency, win rate, and drawdown penalty into one ranked output.",
      "Tie-breaks resolve by higher PnL, then higher volume, then earliest attainment timestamp.",
      "Flagged accounts remain visible on the board but are excluded from rewards until ops review clears them.",
    ],
  },
  {
    title: "Rewards",
    items: [
      "Prize pools are funded by entry fees and displayed as deterministic splits for the top five eligible finishers.",
      "Top finishers unlock Funded Trader season status and modeled revenue-share eligibility.",
      "Quest points, streak multipliers, and raffle tickets stack on top of cash rewards to keep non-winners engaged.",
    ],
  },
  {
    title: "Adrena Integration",
    items: [
      "Leaderboard deltas, quest updates, streak updates, raffle ticket issuance, and reward exports are isolated behind adapters.",
      "The wiring boundaries match the expected Adrena services.",
      "Real payment flows and market-performance ingestion can replace adapters without a UI refactor.",
    ],
  },
  {
    title: "Abuse Prevention",
    items: [
      "Entry fees create economic friction against sybil farming.",
      "Manual review, sybil, and wash-trading flags block rewards without hiding suspicious accounts.",
      "Deterministic ranking plus eligibility overlays make moderation auditable for both users and ops.",
    ],
  },
];

export const deploymentNotes = [
  "Use `npm install`, `npm run dev`, and `npm run build` for the local app lifecycle.",
  "Competition presets, prize splits, and seeded trader data live in the database and `lib/competition/config.ts`.",
  "Adapter implementations are backed by Adrena live data.",
  "Keep the wallet client on devnet for demo mode until enrollment and reward settlement are connected to real infrastructure.",
];

export const pilotFeedback = [
  {
    group: "Seed cohort dry-run",
    note: "Five seeded traders plus one viewer profile produced clear leaderboard movement and an understandable reward preview.",
  },
  {
    group: "Product readout",
    note: "The strongest engagement hook was seeing funded-season upside update alongside rank, not just raw PnL.",
  },
  {
    group: "Ops review",
    note: "Visible but ineligible flagged accounts tested better than silently removing traders from the standings.",
  },
  {
    group: "Iteration recommendation",
    note: "The next version should add historical cohort archives and a real enrollment transaction path before user pilots.",
  },
];

export const differentiators = [
  {
    title: "Commitment, not passive farming",
    detail:
      "Paid cohort entry turns competitions into a deliberate trade instead of a free tab people ignore until the last hour.",
  },
  {
    title: "Funded desk progression",
    detail:
      "Winning does not end with a payout. The best traders graduate into a season ladder with modeled fee-share upside.",
  },
  {
    title: "Operator-ready abuse controls",
    detail:
      "Eligibility overlays, review states, and leaderboard export deltas make moderation transparent instead of ad hoc.",
  },
  {
    title: "Market launch machine",
    detail:
      "Preset-driven cohorts let Adrena spotlight new RWA markets with campaign-level framing and no custom event code.",
  },
];

export const fundedDeskLadder = [
  {
    tier: "Watchlist",
    target: "Top 15 finish or 900 season points, 1 active week",
    reward: "Badge, priority cohort invites, 150 bps revenue share",
  },
  {
    tier: "Funded",
    target: "Top 5 finish or 1,150 season points, 2 active weeks",
    reward: "Private desk chat, analytics dashboard, 450 bps revenue share",
  },
  {
    tier: "Senior Funded",
    target: "Top 3 finish or 1,800 season points, 4 active weeks",
    reward: "Direct support access, premium analytics, 700 bps revenue share",
  },
  {
    tier: "Captain",
    target: "Win a cohort or 2,500 points, 6 active weeks",
    reward: "Desk leadership, strategy sessions, 1000 bps revenue share",
  },
  {
    tier: "Partner",
    target: "Win a cohort or 4,000 points, 12 active weeks",
    reward: "Governance participation, protocol advisory, 1500 bps revenue share",
  },
];

export const archivedCohorts = [
  {
    name: "Macro Sprint 03.12",
    result: "94 entries, $4.9k pool, 31% of entrants returned the next day",
  },
  {
    name: "Carry Breaker 03.05",
    result: "73 entries, 18 funded-watchlist promotions, 2 abuse reviews",
  },
  {
    name: "Crypto Impulse 02.28",
    result: "121 entries, highest quest completion rate of the season at 68%",
  },
];

export const opsPlaybook = [
  "Review reward-blocked accounts at cohort close and clear or confirm flags before settlement.",
  "Publish funded-status promotions and leaderboard deltas into the season feed immediately after cohort finalization.",
  "Use archived cohort conversion and re-entry rates to retune entry fees, participant caps, and preset narratives.",
];
