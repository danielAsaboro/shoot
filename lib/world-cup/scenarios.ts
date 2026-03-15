import type { CompetitionPreset, ScenarioDefinition } from "./types.ts";
import { defaultWeights, defaultGuardrails } from "./types.ts";

export const scenarios: ScenarioDefinition[] = [
  {
    id: "specialization",
    label: "Specialization Week",
    phase: "Phase 1",
    summary:
      "Cup commitments open, identity forms, and early quest momentum matters.",
  },
  {
    id: "bubble",
    label: "Bubble Race",
    phase: "Phase 2",
    summary:
      "Qualification lines are visible and every mission flips the table.",
  },
  {
    id: "finals",
    label: "Knockout Finals",
    phase: "Phase 3-4",
    summary: "Cup winners chase the Grand Finals with tighter risk controls.",
  },
  {
    id: "integrity",
    label: "Integrity Review",
    phase: "Ops Mode",
    summary:
      "Organizer tools surface abuse flags and reward eligibility changes.",
  },
  {
    id: "group_stage",
    label: "Group Stage",
    phase: "Phase 2",
    summary:
      "32 qualifiers per division drawn into 8 groups of 4. Round-robin league tables determine knockout seeding.",
  },
];

export const competitionPresets: CompetitionPreset[] = [
  {
    id: "launch-week",
    label: "Launch Week",
    summary:
      "Balanced scoring for a first public season with broad accessibility.",
    cupId: "crypto",
    scenarioId: "bubble",
    weights: defaultWeights,
    guardrails: defaultGuardrails,
  },
  {
    id: "rwa-spotlight",
    label: "RWA Spotlight",
    summary:
      "Pushes consistency and missions harder to showcase macro-specialist identity.",
    cupId: "metals",
    scenarioId: "finals",
    weights: {
      riskAdjustedPnl: 42,
      consistency: 25,
      missionProgress: 18,
      streakPower: 10,
      raffleBonus: 5,
    },
    guardrails: {
      minVolume: 90000,
      minTrades: 16,
      maxSingleTradeShare: 40,
    },
  },
  {
    id: "integrity-lock",
    label: "Integrity Lock",
    summary:
      "Tighter guardrails for a high-stakes invitational or sponsor-backed finals week.",
    cupId: "energy",
    scenarioId: "integrity",
    weights: {
      riskAdjustedPnl: 45,
      consistency: 24,
      missionProgress: 13,
      streakPower: 12,
      raffleBonus: 6,
    },
    guardrails: {
      minVolume: 110000,
      minTrades: 18,
      maxSingleTradeShare: 35,
    },
  },
  {
    id: "spectator-finals",
    label: "Spectator Finals",
    summary:
      "Leans into supporter energy and return loops for a branded Grand Finals campaign.",
    cupId: "forex",
    scenarioId: "finals",
    weights: {
      riskAdjustedPnl: 44,
      consistency: 20,
      missionProgress: 16,
      streakPower: 11,
      raffleBonus: 9,
    },
    guardrails: {
      minVolume: 80000,
      minTrades: 15,
      maxSingleTradeShare: 42,
    },
  },
];
