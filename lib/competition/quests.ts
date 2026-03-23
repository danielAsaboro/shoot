/**
 * Quest state machine — DB-backed.
 *
 * Manages a catalog of quests that react to challenge lifecycle events.
 * All state is persisted to PostgreSQL via the queries module.
 */

import type { QuestProgress } from "../shared/types.ts";

// ── Quest catalog ────────────────────────────────────────────────────────────

export type QuestEvent =
  | "challenge_start"
  | "challenge_pass"
  | "challenge_fail"
  | "challenge_start_metals"
  | "challenge_start_energy"
  | "challenge_pass_after_fail"
  | "volume_threshold"
  | "specialist_track_completed"
  | "challenge_pass_elite_disciplined"
  | "worldcup_qualify"
  | "worldcup_all_divisions";

export interface QuestDefinition {
  id: string;
  label: string;
  target: number;
  /** Which events increment progress for this quest. */
  triggers: QuestEvent[];
  /** Mutagen reward on completion. */
  mutagenReward: number;
  /** Raffle tickets awarded on completion. */
  raffleTickets: number;
  /** Phase when this quest ships (1, 2, or 3). */
  phase: number;
}

export const QUEST_CATALOG: QuestDefinition[] = [
  // Phase 1
  {
    id: "first_challenge",
    label: "First Challenge",
    target: 1,
    triggers: ["challenge_start"],
    mutagenReward: 200,
    raffleTickets: 2,
    phase: 1,
  },
  {
    id: "scout_graduate",
    label: "Scout Graduate",
    target: 1,
    triggers: ["challenge_pass"],
    mutagenReward: 500,
    raffleTickets: 5,
    phase: 1,
  },
  {
    id: "metals_explorer",
    label: "Metals Explorer",
    target: 1,
    triggers: ["challenge_start_metals"],
    mutagenReward: 300,
    raffleTickets: 3,
    phase: 1,
  },
  {
    id: "energy_pioneer",
    label: "Energy Pioneer",
    target: 1,
    triggers: ["challenge_start_energy"],
    mutagenReward: 300,
    raffleTickets: 3,
    phase: 1,
  },
  {
    id: "comeback_trail",
    label: "Comeback Trail",
    target: 1,
    triggers: ["challenge_pass_after_fail"],
    mutagenReward: 400,
    raffleTickets: 4,
    phase: 1,
  },
  // Phase 2
  {
    id: "volume_hunter",
    label: "Volume Hunter",
    target: 1,
    triggers: ["volume_threshold"],
    mutagenReward: 600,
    raffleTickets: 6,
    phase: 2,
  },
  {
    id: "specialist_explorer",
    label: "Specialist Explorer",
    target: 3,
    triggers: ["specialist_track_completed"],
    mutagenReward: 500,
    raffleTickets: 5,
    phase: 2,
  },
  {
    id: "iron_discipline",
    label: "Iron Discipline",
    target: 1,
    triggers: ["challenge_pass_elite_disciplined"],
    mutagenReward: 1000,
    raffleTickets: 10,
    phase: 2,
  },
  // Phase 3
  {
    id: "worldcup_qualifier",
    label: "World Cup Qualifier",
    target: 1,
    triggers: ["worldcup_qualify"],
    mutagenReward: 800,
    raffleTickets: 8,
    phase: 3,
  },
  {
    id: "globetrotter",
    label: "Globetrotter",
    target: 1,
    triggers: ["worldcup_all_divisions"],
    mutagenReward: 1200,
    raffleTickets: 12,
    phase: 3,
  },
];

// ── Quest engine (server-side, DB-backed) ────────────────────────────────────

export class QuestEngine {
  private state: Record<string, number> = {};
  private wallet: string | null;

  constructor(wallet?: string) {
    this.wallet = wallet ?? null;
  }

  /** Load quest state from server API. */
  async loadFromDb(): Promise<void> {
    if (!this.wallet) return;
    try {
      const res = await fetch(
        `/api/competition/quests?wallet=${encodeURIComponent(this.wallet)}`
      );
      if (!res.ok) return;
      const data = await res.json();
      if (data.progress && Array.isArray(data.progress)) {
        for (const row of data.progress) {
          this.state[row.questId] = row.progress;
        }
      }
    } catch {
      // API unavailable
    }
  }

  /** Persist quest progress via server API. */
  private async persistToDb(
    questId: string,
    progress: number,
    completed: boolean
  ): Promise<void> {
    if (!this.wallet) return;
    try {
      await fetch("/api/competition/quests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wallet: this.wallet,
          questId,
          progress,
          completed,
        }),
      });
    } catch {
      // API unavailable
    }
  }

  /** Process an event and increment matching quest progress. Returns updated active quests. */
  async checkProgress(event: QuestEvent): Promise<QuestProgress[]> {
    for (const quest of QUEST_CATALOG) {
      if (quest.triggers.includes(event)) {
        const current = this.state[quest.id] ?? 0;
        if (current < quest.target) {
          const newProgress = current + 1;
          this.state[quest.id] = newProgress;
          await this.persistToDb(
            quest.id,
            newProgress,
            newProgress >= quest.target
          );
        }
      }
    }
    return this.getActiveQuests();
  }

  /** Get all quests with their current progress. */
  getActiveQuests(): QuestProgress[] {
    return QUEST_CATALOG.map((quest) => ({
      label: quest.label,
      progress: Math.min(this.state[quest.id] ?? 0, quest.target),
      target: quest.target,
      mutagenReward: quest.mutagenReward,
      raffleTickets: quest.raffleTickets,
    }));
  }

  /** Get only completed quests. */
  getCompletedQuests(): QuestProgress[] {
    return this.getActiveQuests().filter((q) => q.progress >= q.target);
  }

  /** Get quests filtered by phase. */
  getQuestsByPhase(phase: number): QuestProgress[] {
    return QUEST_CATALOG.filter((q) => q.phase === phase).map((quest) => ({
      label: quest.label,
      progress: Math.min(this.state[quest.id] ?? 0, quest.target),
      target: quest.target,
      mutagenReward: quest.mutagenReward,
      raffleTickets: quest.raffleTickets,
    }));
  }

  /** Reset all quest progress. */
  reset() {
    this.state = {};
  }
}
