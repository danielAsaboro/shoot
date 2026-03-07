/**
 * Feature status flags for the Prop Challenge Hub.
 *
 * All features are live — backed by real Adrena position data and PostgreSQL.
 */

export type FeatureStatus = "live";

export const FEATURE_STATUS: Record<string, { status: FeatureStatus; label: string }> = {
  leaderboard:         { status: "live", label: "Leaderboard & Scoring" },
  enrollment:          { status: "live", label: "Enrollment & Entry Payments" },
  tier_selector:       { status: "live", label: "Challenge Tier Selection" },
  sybil_detection:     { status: "live", label: "Sybil Detection Engine" },
  live_adapter:        { status: "live", label: "Adrena Live Data Adapter" },
  projection_lab:      { status: "live", label: "Projection Lab" },
  funded_progression:  { status: "live", label: "Funded Trader Progression" },
  desk_wars:           { status: "live", label: "Desk Wars (Team Competition)" },
  risk_events:         { status: "live", label: "Dynamic Risk Events" },
  spectator_voting:    { status: "live", label: "Spectator Voting" },
  rivalry_tracking:    { status: "live", label: "Rivalry Tracking" },
  narrative_beats:     { status: "live", label: "Live Commentary / Narrative" },
  matchups:            { status: "live", label: "Head-to-Head Matchups" },
  world_cup:           { status: "live", label: "World Cup Tournament" },
  quests:              { status: "live", label: "Quests" },
  streaks:             { status: "live", label: "Streaks" },
  raffle:              { status: "live", label: "Raffle Drawings" },
} as const;

export function isLiveProvider(): boolean {
  return true;
}
