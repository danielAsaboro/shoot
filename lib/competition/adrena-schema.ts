import { toAdrenaSnapshotPayload } from "./adrena-contract.ts";
import { adrenaLiveAdapter } from "./adrena-live-adapter.ts";

export const adrenaSnapshotSchema = {
  $id: "adrena-competition-snapshot-v1",
  type: "object",
  required: ["config", "cohorts", "meta", "season", "viewer"],
  properties: {
    meta: {
      type: "object",
      required: ["generated_at", "schema_version", "source"],
      properties: {
        generated_at: { type: "string", format: "date-time" },
        schema_version: { const: "adrena-competition-snapshot-v1" },
        source: { type: "string" },
      },
    },
    config: {
      type: "object",
      required: [
        "cohort_duration_hours",
        "entry_fee_usd",
        "funded_reward_share_bps",
        "participant_cap",
        "presets",
        "prize_pool_split",
        "scoring_weights",
        "season_id",
      ],
    },
    cohorts: {
      type: "array",
      items: {
        type: "object",
        required: [
          "id",
          "name",
          "state",
          "start_time",
          "end_time",
          "reward_pool_usd",
          "entry_fee_usd",
          "participant_cap",
          "enrolled_count",
          "leaderboard",
        ],
      },
    },
    season: {
      type: "object",
      required: [
        "season_id",
        "title",
        "volume_share_percent",
        "cohorts_running",
        "paid_entries",
        "total_prize_pool_usd",
      ],
    },
    viewer: {
      type: "object",
      required: [
        "wallet",
        "display_name",
        "connected",
        "enrolled_cohort_id",
        "funded_status",
        "season_points",
        "quest_progress",
        "streak_days",
        "streak_state",
        "raffle_tickets",
      ],
    },
  },
} as const;

export async function getAdrenaSnapshotExample() {
  const snapshot = await adrenaLiveAdapter.getSnapshot();
  return toAdrenaSnapshotPayload(snapshot, "schema-example");
}
