"use client";

import type {
  DeskStanding,
  HeadToHeadMatch,
  LivePnlRace,
  RiskEvent,
} from "@/lib/competition/types";
import { computeMatchupOdds } from "@/lib/competition/matchups";

// ── Formatters ───────────────────────────────────────────────────────────────

function formatPercent(value: number) {
  return `${value.toFixed(1)}%`;
}

function formatSignedNumber(value: number) {
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}`;
}

// ── Props ────────────────────────────────────────────────────────────────────

interface MatchupsSectionProps {
  matchups: HeadToHeadMatch[];
  pnlRace: LivePnlRace | null;
  deskStandings: DeskStanding[];
  activeRiskEvents: RiskEvent[];
  standings: Array<{
    wallet: string;
    displayName: string;
    tournamentScore: number;
    pnlPercent: number;
  }>;
}

// ── Risk Event Badge ─────────────────────────────────────────────────────────

function RiskEventBadge({ event }: { event: RiskEvent }) {
  const severityColors = {
    mild: {
      bg: "rgba(129,140,248,0.1)",
      border: "rgba(129,140,248,0.3)",
      text: "#818cf8",
    },
    moderate: {
      bg: "rgba(191,255,0,0.1)",
      border: "rgba(191,255,0,0.3)",
      text: "#BFFF00",
    },
    severe: {
      bg: "rgba(255,61,61,0.1)",
      border: "rgba(255,61,61,0.3)",
      text: "#FF3D3D",
    },
  };
  const colors = severityColors[event.severity];

  return (
    <div
      className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-bold"
      style={{
        background: colors.bg,
        border: `1px solid ${colors.border}`,
        color: colors.text,
        borderRadius: "2px",
      }}
    >
      <span
        className="h-1.5 w-1.5"
        style={{ background: colors.text, borderRadius: "2px" }}
      />
      {event.label}
    </div>
  );
}

// ── Win Probability Bar ──────────────────────────────────────────────────────

function WinProbBar({
  prob,
  align,
}: {
  prob: number;
  align: "left" | "right";
}) {
  return (
    <div
      className="h-1 w-full mt-1"
      style={{
        background: "rgba(255,255,255,0.06)",
        borderRadius: "1px",
      }}
    >
      <div
        style={{
          height: "100%",
          width: `${(prob * 100).toFixed(1)}%`,
          background: "var(--accent, #00F0FF)",
          borderRadius: "1px",
          marginLeft: align === "right" ? "auto" : undefined,
          marginRight: align === "left" ? "auto" : undefined,
          opacity: 0.7,
        }}
      />
    </div>
  );
}

// ── Head-to-Head Card ────────────────────────────────────────────────────────

function MatchupCard({
  match,
  standings,
}: {
  match: HeadToHeadMatch;
  standings: MatchupsSectionProps["standings"];
}) {
  const traderA = standings.find((s) => s.wallet === match.traderA);
  const traderB = standings.find((s) => s.wallet === match.traderB);

  if (!traderA || !traderB) return null;

  const odds = computeMatchupOdds(
    {
      ...traderA,
      rank: 0,
      badge: "",
      volumeUsd: 0,
      winRate: 0,
      consistencyScore: 0,
      maxDrawdownPercent: 0,
      attainedAt: "",
      eligible: true,
      questRewardPoints: 0,
      raffleTicketsAwarded: 0,
    },
    {
      ...traderB,
      rank: 0,
      badge: "",
      volumeUsd: 0,
      winRate: 0,
      consistencyScore: 0,
      maxDrawdownPercent: 0,
      attainedAt: "",
      eligible: true,
      questRewardPoints: 0,
      raffleTicketsAwarded: 0,
    }
  );

  const isCompleted = match.status === "completed";
  const isLive = match.status === "live";
  const winnerId = match.result?.winnerId;

  return (
    <div
      className="border bg-white/[0.02] p-4"
      style={{
        borderRadius: "4px",
        borderColor: "var(--border-default, rgba(255,255,255,0.08))",
      }}
    >
      <div className="flex items-center justify-between mb-3">
        {isLive ? (
          <span
            className="animate-live-blink px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
            style={{
              background: "rgba(255,61,61,0.15)",
              color: "#FF3D3D",
              border: "1px solid rgba(255,61,61,0.4)",
              borderRadius: "2px",
            }}
          >
            LIVE
          </span>
        ) : (
          <span
            className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
            style={{
              background: "rgba(255,255,255,0.05)",
              color: "rgba(255,255,255,0.5)",
              borderRadius: "2px",
            }}
          >
            {isCompleted ? "FINAL" : "SCHEDULED"}
          </span>
        )}
        {match.result?.riskEventActive && (
          <span className="text-[10px] font-bold" style={{ color: "#BFFF00" }}>
            Risk: {match.result.riskEventActive}
          </span>
        )}
      </div>

      <div className="grid grid-cols-[1fr_auto_1fr] gap-3 items-center">
        <div className="text-center">
          <p
            className="text-sm font-semibold"
            style={{
              color:
                isCompleted && winnerId === match.traderA
                  ? "#00FF87"
                  : undefined,
            }}
          >
            {traderA.displayName}
          </p>
          <p className="text-xs text-white/50 font-mono">
            {formatPercent(odds.aWinProb * 100)}
          </p>
          <WinProbBar prob={odds.aWinProb} align="right" />
        </div>

        <div className="text-center">
          {isCompleted ? (
            <div>
              <span className="text-lg font-bold text-white/80">
                {match.result?.isDraw ? "DRAW" : ""}
              </span>
              {!match.result?.isDraw && (
                <p className="text-[10px] text-white/40 font-mono">
                  Margin: {match.result?.marginScore.toFixed(1)}
                </p>
              )}
            </div>
          ) : (
            <span
              className="font-bold text-white/30"
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "28px",
                lineHeight: 1,
              }}
            >
              VS
            </span>
          )}
        </div>

        <div className="text-center">
          <p
            className="text-sm font-semibold"
            style={{
              color:
                isCompleted && winnerId === match.traderB
                  ? "#00FF87"
                  : undefined,
            }}
          >
            {traderB.displayName}
          </p>
          <p className="text-xs text-white/50 font-mono">
            {formatPercent(odds.bWinProb * 100)}
          </p>
          <WinProbBar prob={odds.bWinProb} align="left" />
        </div>
      </div>
    </div>
  );
}

// ── P&L Race ─────────────────────────────────────────────────────────────────

function PnlRaceSection({ race }: { race: LivePnlRace }) {
  const momentumColors = {
    surging: "#00FF87",
    stable: "#818cf8",
    fading: "#FF3D3D",
  };

  return (
    <div
      className="border bg-white/[0.02] p-4"
      style={{
        borderRadius: "4px",
        borderColor: "var(--border-default, rgba(255,255,255,0.08))",
      }}
    >
      <p
        className="mb-3 text-xs font-bold uppercase tracking-widest"
        style={{
          fontFamily: "var(--font-display)",
          color: "var(--accent, #00F0FF)",
        }}
      >
        LIVE P&L RACE
      </p>
      <div className="space-y-2">
        {race.entries.slice(0, 10).map((entry, idx) => (
          <div key={entry.wallet} className="flex items-center gap-3 text-sm">
            <span
              className="w-6 text-right font-bold"
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "1.25rem",
                lineHeight: 1,
                color: "rgba(255,255,255,0.4)",
              }}
            >
              {idx + 1}
            </span>
            <span className="flex-1 font-semibold">{entry.displayName}</span>
            <span
              className="font-mono font-bold"
              style={{ color: entry.pnl >= 0 ? "#00FF87" : "#FF3D3D" }}
            >
              {formatSignedNumber(entry.pnl)}%
            </span>
            <span
              className="h-2 w-2"
              style={{
                background: momentumColors[entry.momentum],
                borderRadius: "2px",
              }}
              title={entry.momentum}
            />
            {entry.rankDelta !== 0 && (
              <span
                className="text-[10px] font-bold"
                style={{ color: entry.rankDelta > 0 ? "#00FF87" : "#FF3D3D" }}
              >
                {entry.rankDelta > 0
                  ? `▲${entry.rankDelta}`
                  : `▼${Math.abs(entry.rankDelta)}`}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Desk Standings ───────────────────────────────────────────────────────────

function DeskStandingsSection({ standings }: { standings: DeskStanding[] }) {
  const promotionColors = {
    promoted: "#00FF87",
    relegated: "#FF3D3D",
    stable: "#818cf8",
  };

  return (
    <div
      className="border bg-white/[0.02] p-4"
      style={{
        borderRadius: "4px",
        borderColor: "var(--border-default, rgba(255,255,255,0.08))",
      }}
    >
      <p
        className="mb-3 text-xs font-bold uppercase tracking-widest"
        style={{
          fontFamily: "var(--font-display)",
          color: "var(--accent, #00F0FF)",
        }}
      >
        DESK STANDINGS
      </p>
      <div className="space-y-3">
        {standings.map((ds, idx) => (
          <div key={ds.desk.id} className="flex items-center gap-3">
            <span
              className="w-6 text-right font-bold"
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "1.25rem",
                lineHeight: 1,
                color: "rgba(255,255,255,0.4)",
              }}
            >
              {idx + 1}
            </span>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold">{ds.desk.name}</span>
                <span
                  className="px-1.5 py-0.5 text-[9px] font-bold"
                  style={{
                    background: `${promotionColors[ds.promotion]}22`,
                    color: promotionColors[ds.promotion],
                    borderRadius: "2px",
                  }}
                >
                  {ds.promotion.toUpperCase()}
                </span>
              </div>
              <p className="text-[10px] text-white/40">{ds.desk.motto}</p>
            </div>
            <div className="text-right">
              <p className="font-mono text-sm font-bold">{ds.deskScore}</p>
              <p className="text-[10px] text-white/40">
                {ds.desk.members.length} traders
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────

export function CompetitionMatchups({
  matchups,
  pnlRace,
  deskStandings,
  activeRiskEvents,
  standings,
}: MatchupsSectionProps) {
  if (matchups.length === 0) {
    return (
      <div className="panel">
        <p className="text-sm text-white/50">
          No matchups available for this cohort yet.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Risk Events */}
      {activeRiskEvents.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {activeRiskEvents.map((event) => (
            <RiskEventBadge key={event.id} event={event} />
          ))}
        </div>
      )}

      {/* Head-to-Head Cards */}
      <div>
        <p
          className="mb-3 text-xs font-bold uppercase tracking-widest"
          style={{
            fontFamily: "var(--font-display)",
            color: "var(--accent, #00F0FF)",
          }}
        >
          HEAD-TO-HEAD MATCHUPS
        </p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {matchups.slice(0, 6).map((match) => (
            <MatchupCard key={match.id} match={match} standings={standings} />
          ))}
        </div>
      </div>

      {/* P&L Race + Desk Standings */}
      <div className="grid gap-4 md:grid-cols-2">
        {pnlRace && <PnlRaceSection race={pnlRace} />}
        {deskStandings.length > 0 && (
          <DeskStandingsSection standings={deskStandings} />
        )}
      </div>
    </div>
  );
}
