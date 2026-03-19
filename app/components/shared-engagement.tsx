import type { QuestProgress } from "@/lib/shared/types";

interface SharedEngagementProps {
  questProgress: QuestProgress[];
  streakDays: number;
  streakState: string;
  raffleTickets: number;
}

export function SharedEngagement({
  questProgress,
  streakDays,
  streakState,
  raffleTickets,
}: SharedEngagementProps) {
  return (
    <div className="panel">
      <div className="section-header">
        <div>
          <p className="eyebrow">Engagement</p>
          <h2 className="section-title">Quests, streaks, raffles</h2>
        </div>
      </div>

      <div className="space-y-4">
        {questProgress.map((quest) => {
          const ratio = Math.min(100, (quest.progress / quest.target) * 100);
          return (
            <div key={quest.label} className="space-y-2">
              <div className="metric-line">
                <span>{quest.label}</span>
                <strong>
                  {quest.progress}/{quest.target}
                </strong>
              </div>
              <div className="progress-rail">
                <span style={{ width: `${ratio}%` }} />
              </div>
            </div>
          );
        })}
      </div>

      <div className="divider" />

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="data-chip">
          <dt>Streak</dt>
          <dd>
            {streakDays}d / {streakState}
          </dd>
        </div>
        <div className="data-chip">
          <dt>Raffle tickets</dt>
          <dd>{raffleTickets}</dd>
        </div>
      </div>
    </div>
  );
}
