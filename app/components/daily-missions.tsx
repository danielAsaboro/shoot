"use client";

import { useEffect, useState } from "react";

// ── Types ────────────────────────────────────────────────────────────────────

interface MissionLeader {
  wallet: string;
  value: number;
  rank: number;
}

interface MissionInfo {
  type: string;
  name: string;
  description: string;
}

interface MissionResults {
  type: string;
  leaders: MissionLeader[];
}

interface Props {
  missions: MissionInfo[];
  results?: MissionResults[];
}

// ── Countdown hook ───────────────────────────────────────────────────────────

function useUtcMidnightCountdown() {
  const [remaining, setRemaining] = useState("");

  useEffect(() => {
    function compute() {
      const now = new Date();
      const utcMidnight = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1),
      );
      const diff = utcMidnight.getTime() - now.getTime();
      const h = Math.floor(diff / 3_600_000);
      const m = Math.floor((diff % 3_600_000) / 60_000);
      const s = Math.floor((diff % 60_000) / 1_000);
      setRemaining(
        `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`,
      );
    }

    compute();
    const id = setInterval(compute, 1_000);
    return () => clearInterval(id);
  }, []);

  return remaining;
}

// ── Component ────────────────────────────────────────────────────────────────

export function DailyMissions({ missions, results }: Props) {
  const countdown = useUtcMidnightCountdown();

  const resultsByType = new Map(
    (results ?? []).map((r) => [r.type, r.leaders]),
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2
          className="text-xs font-semibold"
          style={{
            fontFamily: "var(--font-display)",
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            color: "#00F0FF",
          }}
        >
          Daily Missions
        </h2>
        <div className="flex items-center gap-2">
          <span
            className="animate-live-blink"
            style={{
              width: 6,
              height: 6,
              minWidth: 6,
              background: "#FF3D3D",
            }}
          />
          <span className="text-sm text-white/40" style={{ fontFamily: "var(--font-mono)" }}>
            Resets in {countdown}
          </span>
        </div>
      </div>

      {/* Mission cards */}
      <div className="grid gap-3 sm:grid-cols-3">
        {missions.map((mission) => {
          const leaders = resultsByType.get(mission.type) ?? [];
          return (
            <div
              key={mission.type}
              className="border border-white/8 bg-white/[0.02] p-4 transition hover:border-white/15"
              style={{ borderRadius: 4 }}
            >
              {/* Mission header */}
              <div className="mb-3">
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className="flex-shrink-0"
                    style={{ width: 6, height: 6, minWidth: 6, background: "#00F0FF" }}
                  />
                  <span className="text-sm font-semibold text-white">
                    {mission.name}
                  </span>
                </div>
                <p className="text-xs text-white/40 leading-relaxed">
                  {mission.description}
                </p>
              </div>

              {/* Leaderboard */}
              {leaders.length > 0 ? (
                <div className="space-y-1.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-white/30">
                    Top 3
                  </p>
                  {leaders.slice(0, 3).map((leader) => {
                    const medalColor =
                      leader.rank === 1
                        ? "#BFFF00"
                        : leader.rank === 2
                          ? "#94a3b8"
                          : "#FF3D3D";
                    return (
                      <div
                        key={leader.wallet}
                        className="flex items-center justify-between px-2 py-1.5"
                        style={{
                          background: "rgba(255,255,255,0.02)",
                          border: "1px solid rgba(255,255,255,0.05)",
                          borderRadius: 2,
                        }}
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className="flex items-center justify-center text-[10px] font-bold"
                            style={{
                              width: 18,
                              height: 18,
                              background: `${medalColor}20`,
                              color: medalColor,
                            }}
                          >
                            {leader.rank}
                          </span>
                          <span className="text-xs text-white/60" style={{ fontFamily: "var(--font-mono)" }}>
                            {leader.wallet.slice(0, 4)}...{leader.wallet.slice(-4)}
                          </span>
                        </div>
                        <span className="text-xs font-semibold text-white/80" style={{ fontFamily: "var(--font-mono)" }}>
                          {typeof leader.value === "number" &&
                          leader.value < 1 &&
                          leader.value > 0
                            ? `${(leader.value * 100).toFixed(1)}%`
                            : leader.value.toLocaleString(undefined, {
                                maximumFractionDigits: 2,
                              })}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div
                  className="border border-dashed border-white/8 px-3 py-4 text-center"
                  style={{ borderRadius: 2 }}
                >
                  <p className="text-[11px] text-white/25">
                    No results yet — start trading!
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
