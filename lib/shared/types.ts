// AbuseFlagCode - string union used by Prop Challenges (simple pass/fail)
export type AbuseFlagCode =
  | "sybil_suspicion"
  | "wash_trading_suspicion"
  | "manual_review"
  | "min-volume"
  | "min-trades"
  | "single-trade-share"
  | "specialist_violation";

// AbuseFlagDetail - rich object used by World Cup (severity-based)
export type AbuseFlagDetail = {
  code: string;
  label: string;
  severity: "low" | "medium" | "high";
  reason: string;
};

// Shared across both formats
export type FundedStatus = "none" | "watchlist" | "qualified" | "funded" | "senior_funded" | "captain" | "partner";
export type StreakState = "alive" | "warning" | "broken";
export type CompetitionState = "upcoming" | "live" | "closed";

export interface QuestProgress {
  label: string;
  progress: number;
  target: number;
  mutagenReward?: number;
  raffleTickets?: number;
}

// Conversion helper
export function toAbuseFlagCode(detail: AbuseFlagDetail): AbuseFlagCode {
  return detail.code as AbuseFlagCode;
}
