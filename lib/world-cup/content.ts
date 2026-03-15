import type {
  IntegrationNode,
  PilotStep,
  PilotInsight,
  ComparisonRow,
  RolloutMilestone,
  JudgeProofPoint,
} from "./types.ts";

export const integrationNodes: IntegrationNode[] = [
  {
    system: "Leaderboard",
    role: "Display cup rank, qualification lines, and finals seeds.",
    implementation:
      "Swap the standings adapter with Adrena rank and PnL snapshots, then apply the composite score layer.",
  },
  {
    system: "Quests",
    role: "Turn generic missions into asset-class-specific matchdays.",
    implementation:
      "Feed mission completion into the `missionProgress` component and ticket boosts.",
  },
  {
    system: "Streaks",
    role: "Reward consistent participation, not one lucky trade.",
    implementation:
      "Map existing streak events into the `streakPower` score and eligibility tie-breakers.",
  },
  {
    system: "Raffles",
    role: "Keep mid-table traders engaged throughout the season.",
    implementation:
      "Issue raffle tickets from eligible activity, mission wins, and clean-trading milestones.",
  },
];

export const pilotChecklist: PilotStep[] = [
  {
    title: "Recruit 12-20 traders",
    summary:
      "Split evenly across asset classes and include at least 4 traders already active in Adrena competitions.",
  },
  {
    title: "Run a two-week league",
    summary:
      "Keep the same scoring weights, publish qualification lines daily, and preserve finals slots by cup.",
  },
  {
    title: "Instrument retention",
    summary:
      "Track daily actives, mission completion, return rate after missing a session, and reward eligibility retention.",
  },
  {
    title: "Capture qualitative feedback",
    summary:
      "Interview traders after qualification week and after finals to test whether cup identity changed behavior.",
  },
];

export const pilotInsights: PilotInsight[] = [
  {
    quote:
      "I cared more once I felt like I was representing a desk, not just farming rank.",
    role: "Energy specialist",
    takeaway: "Cup identity increases narrative attachment and return intent.",
  },
  {
    quote:
      "The qualification line gave me a reason to keep trading even after one bad day.",
    role: "Forex grinder",
    takeaway: "Visible cutoff drama fixes the flat mid-season drop-off.",
  },
  {
    quote:
      "Quests mattered because they helped me recover, not just because they were side tasks.",
    role: "Metals participant",
    takeaway:
      "Missions work best when they influence standings and raffle odds together.",
  },
];

export const comparisonRows: ComparisonRow[] = [
  {
    dimension: "Identity",
    baseline:
      "Most competitions are generic PnL races with weak player identity.",
    worldCup: "Traders become visible specialists inside cups and desks.",
    whyItMatters:
      "Identity is what keeps people returning after the first leaderboard snapshot.",
  },
  {
    dimension: "Mid-season retention",
    baseline: "Standard tournaments decay once early leaders separate.",
    worldCup:
      "Qualification lines, missions, desk tiers, and transfer windows keep the table alive.",
    whyItMatters:
      "The win condition is not only signup volume. It is return behavior.",
  },
  {
    dimension: "Social loop",
    baseline: "Most formats only matter to active traders.",
    worldCup: "Supporters can back desks and care about finals outcomes too.",
    whyItMatters:
      "Spectator energy turns competition into marketing inventory.",
  },
  {
    dimension: "Fairness and reviewability",
    baseline:
      "Raw PnL formats invite complaints about one lucky trade and payout fairness.",
    worldCup:
      "Composite scoring and guardrails create a more defensible reward story.",
    whyItMatters:
      "A competition product dies quickly if the leaderboard feels illegitimate.",
  },
  {
    dimension: "Adrena moat",
    baseline: "Generic perp venues can copy brackets and quests.",
    worldCup:
      "Adrena can center cups on RWA and macro asset classes without forcing the theme.",
    whyItMatters:
      "This is one of the few competition formats with a credible product moat.",
  },
];

export const rolloutMilestones: RolloutMilestone[] = [
  {
    phase: "Phase 0",
    duration: "1-2 weeks",
    goal: "Run a closed alpha with one featured cup and no supporter economy.",
    outputs:
      "Composite leaderboard, qualification line, mission scoring, and payout review tooling.",
  },
  {
    phase: "Phase 1",
    duration: "2-4 weeks",
    goal: "Ship full cup coverage with desk wars and promotion pressure.",
    outputs:
      "Four cups, desk standings, captain missions, and finals qualification comms.",
  },
  {
    phase: "Phase 2",
    duration: "4-6 weeks",
    goal: "Open the spectator loop and turn finals into a flagship campaign.",
    outputs:
      "Supporter backing, pick'em rewards, transfer windows, and branded Grand Finals marketing.",
  },
];

export const judgeProofPoints: JudgeProofPoint[] = [
  {
    title: "This is not a theme skin",
    summary:
      "World Cup 2.0 changes the behavioral loop through identity, recurrence, and social pressure.",
  },
  {
    title: "The moat is credible",
    summary:
      "Adrena's RWA and macro-perp positioning makes the cup system feel native rather than forced.",
  },
  {
    title: "The ops layer is visible",
    summary:
      "Weights, guardrails, bracket logic, and reward review are surfaced in a way teams can actually ship.",
  },
  {
    title: "The business case is explicit",
    summary:
      "The simulator reframes the pitch around retention, reward fairness, and competition share of volume.",
  },
];
