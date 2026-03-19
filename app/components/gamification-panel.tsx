"use client";

import { useSyncExternalStore, useEffect, useState } from "react";
import type { QuestProgress, StreakState, FundedStatus } from "@/lib/shared/types";
import type { PropRivalry } from "@/lib/competition/types";
import { DailyMissions } from "./daily-missions";

// Minute-granularity clock for funded countdown — avoids impure Date.now() in render
const minuteListeners = new Set<() => void>();
let minuteTimerId: ReturnType<typeof setInterval> | undefined;
function subscribeMinuteClock(cb: () => void) {
  minuteListeners.add(cb);
  if (!minuteTimerId) {
    minuteTimerId = setInterval(() => minuteListeners.forEach((fn) => fn()), 60_000);
  }
  return () => {
    minuteListeners.delete(cb);
    if (minuteListeners.size === 0 && minuteTimerId) {
      clearInterval(minuteTimerId);
      minuteTimerId = undefined;
    }
  };
}
function getMinuteNow() { return Math.floor(Date.now() / 60_000); }
function getServerMinuteNow() { return Math.floor(Date.now() / 60_000); }

// ── Types ─────────────────────────────────────────────────────────────────────

interface Props {
  questProgress: QuestProgress[];
  streakDays: number;
  streakState: StreakState;
  raffleTickets: number;
  fundedStatus: FundedStatus;
  seasonPoints: number;
  mutagen?: number;
  fundedExpiration?: string; // ISO date string
  earnedBadgeIds?: string[]; // badge IDs earned through challenge lifecycle
  rivalries?: PropRivalry[];
}

// ── Streak fire component ─────────────────────────────────────────────────────

function StreakFire({ days, state }: { days: number; state: StreakState }) {
  const tier =
    days >= 10 ? "inferno"
    : days >= 5 ? "fire"
    : days >= 3 ? "flame"
    : days >= 1 ? "spark"
    : "none";

  const flames: Record<string, { color: string; label: string }> = {
    inferno: { color: "#FF3D3D", label: "Inferno" },
    fire: { color: "#BFFF00", label: "On Fire" },
    flame: { color: "#BF5AF2", label: "Heating Up" },
    spark: { color: "#3D7FFF", label: "Started" },
    none: { color: "#475569", label: "No streak" },
  };

  const f = flames[state === "broken" ? "none" : tier];

  // Heat bar fill percentage based on streak (0–10+ maps to 0–100%)
  const heatPct = Math.min((days / 10) * 100, 100);

  // Heat bar gradient: blue → purple → orange → red
  const heatGradient = "linear-gradient(90deg, #3D7FFF, #BF5AF2, #BFFF00, #FF3D3D)";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline gap-2">
        <span
          className="font-bold text-white"
          style={{ fontFamily: "var(--font-display)", fontSize: "3.5rem", lineHeight: 1, textTransform: "uppercase" }}
        >
          {days}
        </span>
        <span
          className="text-sm text-white/50"
          style={{ fontFamily: "var(--font-display)", textTransform: "uppercase", letterSpacing: "0.1em" }}
        >
          DAY STREAK
        </span>
      </div>

      {/* Heat bar */}
      <div className="w-full h-2 bg-white/5" style={{ borderRadius: 0 }}>
        <div
          className="h-full transition-all duration-700"
          style={{
            width: `${heatPct}%`,
            background: heatGradient,
            borderRadius: 0,
            boxShadow: days >= 5 ? `0 0 12px ${f.color}66` : undefined,
          }}
        />
      </div>

      <div className="flex items-center gap-1.5">
        <span
          style={{
            width: 6,
            height: 6,
            minWidth: 6,
            background:
              state === "broken" ? "#FF3D3D"
              : state === "warning" ? "#BFFF00"
              : "#00FF87",
            animation: state === "warning" ? "pulse 0.8s infinite" : undefined,
          }}
        />
        <span className="text-xs text-white/50">
          {state === "broken" ? "Streak broken" : state === "warning" ? "Trade today to keep it!" : f.label}
        </span>
      </div>
    </div>
  );
}

// ── Badge wall ────────────────────────────────────────────────────────────────

const ALL_BADGES = [
  { id: "scout_complete", label: "Scout Complete", color: "#3D7FFF", category: "challenge", earnHow: "Pass a Scout challenge" },
  { id: "ranger_complete", label: "Ranger Complete", color: "#00FF87", category: "challenge", earnHow: "Pass a Ranger challenge" },
  { id: "veteran_complete", label: "Veteran Complete", color: "#BF5AF2", category: "challenge", earnHow: "Pass a Veteran challenge" },
  { id: "elite_complete", label: "Elite Complete", color: "#BFFF00", category: "challenge", earnHow: "Pass an Elite challenge" },
  { id: "apex_complete", label: "Apex Complete", color: "#FF3D3D", category: "challenge", earnHow: "Pass an Apex challenge" },
  { id: "funded_trader", label: "Funded Trader", color: "#00F0FF", category: "funded", earnHow: "Pass Elite or Apex" },
  { id: "crypto_specialist", label: "Crypto Specialist", color: "#3D7FFF", category: "specialist", earnHow: "Pass Crypto Track" },
  { id: "metals_specialist", label: "Metals Specialist", color: "#BFFF00", category: "specialist", earnHow: "Pass Metals Track" },
  { id: "energy_specialist", label: "Energy Specialist", color: "#FF3D3D", category: "specialist", earnHow: "Pass Energy Track" },
  { id: "forex_specialist", label: "Forex Specialist", color: "#00FF87", category: "specialist", earnHow: "Pass Forex Track" },
  { id: "multi_asset_master", label: "Multi-Asset Master", color: "#BF5AF2", category: "specialist", earnHow: "Pass Multi-Asset Track" },
  { id: "unbreakable", label: "Unbreakable", color: "#FF3D3D", category: "streak", earnHow: "10-day trading streak" },
  { id: "world_cup_champion", label: "World Cup Champion", color: "#00F0FF", category: "worldcup", earnHow: "Win a World Cup division" },
  { id: "grand_champion", label: "Grand Champion", color: "#BFFF00", category: "worldcup", earnHow: "Win the Grand Championship" },
  { id: "comeback", label: "Comeback King", color: "#FF3D3D", category: "worldcup", earnHow: "Win the Redemption Bracket" },
] as const;

type BadgeId = (typeof ALL_BADGES)[number]["id"];

function BadgeWall({ earnedIds }: { earnedIds: BadgeId[] }) {
  const earned = new Set(earnedIds);

  return (
    <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
      {ALL_BADGES.map((badge) => {
        const isEarned = earned.has(badge.id);
        return (
          <div
            key={badge.id}
            className="group relative flex flex-col items-center gap-1.5 p-2 transition"
            style={{
              background: isEarned ? `${badge.color}10` : "rgba(255,255,255,0.02)",
              border: `1px solid ${isEarned ? `${badge.color}30` : "rgba(255,255,255,0.05)"}`,
              opacity: isEarned ? 1 : 0.35,
              borderRadius: 2,
            }}
          >
            <div
              className="flex h-7 w-7 items-center justify-center"
              style={{
                background: `${badge.color}20`,
                border: `1px solid ${badge.color}35`,
                borderRadius: 2,
              }}
            >
              <div
                style={{ width: 8, height: 8, background: badge.color }}
              />
            </div>
            <span className="text-center text-[9px] leading-tight text-white/60">{badge.label}</span>

            {/* Tooltip */}
            <div
              className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 -translate-x-1/2 whitespace-nowrap border border-white/10 px-3 py-2 text-xs text-white/60 opacity-0 shadow-xl transition-opacity group-hover:opacity-100"
              style={{ background: "#0a0a0a", borderRadius: 2 }}
            >
              {isEarned ? "Earned" : badge.earnHow}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Quest progress ────────────────────────────────────────────────────────────

function QuestCard({ quest }: { quest: QuestProgress }) {
  const pct = Math.min((quest.progress / quest.target) * 100, 100);
  const done = quest.progress >= quest.target;

  return (
    <div
      className="border p-4 transition"
      style={{
        background: done ? "rgba(0,255,135,0.04)" : "rgba(255,255,255,0.02)",
        borderColor: done ? "rgba(0,255,135,0.25)" : "rgba(255,255,255,0.08)",
        borderRadius: 4,
      }}
    >
      <div className="mb-3 flex items-start justify-between">
        <div className="flex items-center gap-2">
          <span
            className="flex-shrink-0"
            style={{ width: 6, height: 6, background: done ? "#00FF87" : "#00F0FF" }}
          />
          <span className="text-sm font-semibold text-white">{quest.label}</span>
        </div>
        <span className="text-xs text-white/50" style={{ fontFamily: "var(--font-mono)" }}>
          {quest.progress.toLocaleString()} / {quest.target.toLocaleString()}
        </span>
      </div>
      <div className="w-full overflow-hidden bg-white/10" style={{ height: 3, borderRadius: 0 }}>
        <div
          className="h-full transition-all duration-700"
          style={{
            width: `${pct}%`,
            borderRadius: 0,
            background: done
              ? "linear-gradient(90deg, #00FF8788, #00FF87)"
              : "linear-gradient(90deg, #00F0FF88, #00F0FF)",
            boxShadow: done ? "0 0 8px #00FF8766" : undefined,
          }}
        />
      </div>
    </div>
  );
}

// ── Raffle tickets ────────────────────────────────────────────────────────────

function RaffleDisplay({ tickets }: { tickets: number }) {
  return (
    <div className="border border-white/8 bg-white/[0.02] p-4" style={{ borderRadius: 4 }}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-white">Raffle Tickets</span>
        </div>
        <span className="text-2xl font-bold" style={{ fontFamily: "var(--font-mono)", color: "#00F0FF" }}>{tickets}</span>
      </div>
      <div className="flex gap-1.5 flex-wrap">
        {Array.from({ length: Math.min(tickets, 12) }).map((_, i) => (
          <div
            key={i}
            className="h-6 w-10 text-[10px] font-bold flex items-center justify-center"
            style={{
              background: "linear-gradient(135deg, #00F0FF15, #00F0FF08)",
              border: "1px solid #00F0FF44",
              color: "#00F0FF",
              borderRadius: 2,
            }}
          >
            #{i + 1}
          </div>
        ))}
        {tickets > 12 && (
          <div className="h-6 px-2 text-[10px] font-bold flex items-center" style={{ color: "#00F0FF50" }}>
            +{tickets - 12} more
          </div>
        )}
      </div>
      <p className="mt-3 text-[11px] text-white/30">
        Failed challenges auto-enter weekly raffle. 15% of vault fees fund prizes.
      </p>
    </div>
  );
}

// ── Streak multiplier bands ───────────────────────────────────────────────────

const STREAK_BANDS = [
  { min: 2, max: 2, label: "2-streak", multiplier: "1.5×", color: "#3D7FFF" },
  { min: 3, max: 4, label: "3–4 streak", multiplier: "2×", color: "#BF5AF2" },
  { min: 5, max: 9, label: "5–9 streak", multiplier: "3×", color: "#BFFF00" },
  { min: 10, max: Infinity, label: "10+ streak", multiplier: "5× + Unbreakable badge", color: "#FF3D3D" },
];

// ── Main component ────────────────────────────────────────────────────────────

export function GamificationPanel({
  questProgress,
  streakDays,
  streakState,
  raffleTickets,
  fundedStatus,
  seasonPoints,
  mutagen = 0,
  fundedExpiration,
  earnedBadgeIds = [],
  rivalries,
}: Props) {
  // Compute funded countdown using external store (minute-granularity clock)
  const minuteNow = useSyncExternalStore(subscribeMinuteClock, getMinuteNow, getServerMinuteNow);
  const fundedDaysLeft = fundedExpiration
    ? Math.max(0, Math.ceil((new Date(fundedExpiration).getTime() - minuteNow * 60_000) / 86_400_000))
    : null;
  // Badges earned through actual challenge lifecycle events
  const earnedBadges = earnedBadgeIds as BadgeId[];

  const activeBand = STREAK_BANDS.find((b) => streakDays >= b.min && streakDays <= b.max);
  const totalMutagen = mutagen || seasonPoints * 4;

  // Fetch daily missions
  const [dailyMissions, setDailyMissions] = useState<{ type: string; name: string; description: string }[]>([]);
  useEffect(() => {
    fetch("/api/competition/daily")
      .then((res) => res.json())
      .then((data) => setDailyMissions(data.missions ?? []))
      .catch(() => {});
  }, []);

  return (
    <div className="space-y-6">
      {/* Section header */}
      <h2
        className="section-title"
        style={{ fontFamily: "var(--font-display)", textTransform: "uppercase", letterSpacing: "0.1em" }}
      >
        Engagement
      </h2>

      {/* ── Daily Missions ── */}
      {dailyMissions.length > 0 && (
        <DailyMissions missions={dailyMissions} />
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {/* ── Streak card ── */}
        <div className="border border-white/10 bg-white/[0.02] p-5" style={{ borderRadius: 4 }}>
          <div className="mb-4 flex items-center justify-between">
            <p
              className="text-xs font-semibold text-white/50"
              style={{ fontFamily: "var(--font-display)", textTransform: "uppercase", letterSpacing: "0.1em" }}
            >
              Trading Streak
            </p>
            {activeBand && (
              <span
                className="px-2 py-0.5 text-[10px] font-bold"
                style={{ background: `${activeBand.color}22`, color: activeBand.color, borderRadius: 2 }}
              >
                {activeBand.multiplier} Mutagen
              </span>
            )}
          </div>

          <StreakFire days={streakDays} state={streakState} />

          {/* Streak progression bar */}
          <div className="mt-4 space-y-1.5">
            {STREAK_BANDS.map((band) => {
              const isActive = streakDays >= band.min && streakDays <= band.max;
              const isPast = streakDays > band.max;
              return (
                <div key={band.label} className="flex items-center gap-2 text-xs">
                  <div
                    className="flex-shrink-0"
                    style={{
                      width: 6,
                      height: 6,
                      background: isPast || isActive ? band.color : "rgba(255,255,255,0.2)",
                    }}
                  />
                  <span className={isPast || isActive ? "text-white/70" : "text-white/25"}>
                    {band.label}: {band.multiplier}
                  </span>
                  {isActive && (
                    <span className="px-1 text-[9px] font-bold" style={{ background: `${band.color}22`, color: band.color, borderRadius: 2 }}>
                      ACTIVE
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {streakState === "warning" && (
            <div
              className="mt-4 border px-3 py-2 text-xs"
              style={{
                animation: "pulse 1.5s infinite",
                borderRadius: 4,
                borderColor: "#00F0FF33",
                background: "#00F0FF08",
                color: "#00F0FF",
              }}
            >
              Trade today to preserve your {streakDays}-day streak!
            </div>
          )}
        </div>

        {/* ── Mutagen + funded ── */}
        <div className="space-y-4">
          <div className="border border-white/10 bg-white/[0.02] p-4" style={{ borderRadius: 4 }}>
            <div className="flex items-center justify-between mb-2">
              <p
                className="text-xs font-semibold text-white/50"
                style={{ fontFamily: "var(--font-display)", textTransform: "uppercase", letterSpacing: "0.1em" }}
              >
                Season Mutagen
              </p>
              <span className="text-xl font-bold" style={{ fontFamily: "var(--font-mono)", color: "#00F0FF" }}>{totalMutagen.toLocaleString()}</span>
            </div>
            <div className="w-full overflow-hidden bg-white/10" style={{ height: 3, borderRadius: 0 }}>
              <div
                className="h-full"
                style={{
                  width: `${Math.min((totalMutagen / 10000) * 100, 100)}%`,
                  background: "linear-gradient(90deg, #00F0FF88, #00F0FF)",
                  borderRadius: 0,
                }}
              />
            </div>
            <p className="mt-1.5 text-[10px] text-white/30">
              Earn 1.2×–3× more during active challenges + World Cup
            </p>
          </div>

          <div
            className={fundedStatus === "qualified" ? "funded-card glow-gold" : "border border-white/8 bg-white/[0.02] p-4"}
            style={{ borderRadius: 4 }}
          >
            <div className="flex items-center gap-2 mb-2">
              <span
                className="flex-shrink-0"
                style={{
                  width: 8,
                  height: 8,
                  background: fundedStatus === "qualified" ? "#00F0FF" : fundedStatus === "watchlist" ? "#BFFF00" : "#475569",
                }}
              />
              <div>
                <p className="text-sm font-bold" style={{ color: fundedStatus === "qualified" ? "#00F0FF" : "white" }}>
                  {fundedStatus === "qualified" ? "Funded Trader" : fundedStatus === "watchlist" ? "Watchlist" : "Unranked"}
                </p>
                <p className="text-xs text-white/40">
                  {fundedStatus === "qualified"
                    ? "10% fee rebate · World Cup seeded · Discord role"
                    : fundedStatus === "watchlist"
                    ? "150 bps revenue share · 3 more wins for Funded"
                    : "Pass Elite or Apex to unlock Funded status"}
                </p>
              </div>
            </div>
            {fundedStatus === "qualified" && fundedDaysLeft !== null && (
              <div className="mt-3 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span style={{ color: "#00F0FFb3" }}>Status expires in</span>
                  <span className="font-bold" style={{ fontFamily: "var(--font-mono)", color: "#00F0FF" }}>{fundedDaysLeft}d</span>
                </div>
                <div className="w-full overflow-hidden" style={{ height: 3, borderRadius: 0, background: "#00F0FF1a" }}>
                  <div
                    className="h-full"
                    style={{
                      width: `${Math.min((fundedDaysLeft / 180) * 100, 100)}%`,
                      background: "#00F0FF",
                      borderRadius: 0,
                    }}
                  />
                </div>
                <div className="space-y-1 mt-2">
                  <p className="text-[10px]" style={{ color: "#00F0FF99" }}>10% fee rebate on all challenges</p>
                  <p className="text-[10px]" style={{ color: "#00F0FF99" }}>World Cup auto-qualification</p>
                  <p className="text-[10px]" style={{ color: "#00F0FF99" }}>Exclusive Discord role</p>
                  <p className="text-[10px]" style={{ color: "#00F0FF99" }}>450 bps revenue share eligibility</p>
                  <p className="text-[10px]" style={{ color: "#00F0FF99" }}>Priority support queue</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Quests ── */}
      <div>
        <p
          className="mb-3 text-xs font-semibold text-white/50"
          style={{ fontFamily: "var(--font-display)", textTransform: "uppercase", letterSpacing: "0.1em" }}
        >
          Active Quests
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {questProgress.map((quest) => (
            <QuestCard key={quest.label} quest={quest} />
          ))}
          {/* Show some locked quests for discovery */}
          {[
            { label: "Pass 3 challenges in a week", progress: 0, target: 3 },
            { label: "Pass challenge without >10× leverage", progress: 0, target: 1 },
          ].map((q) => (
            <div key={q.label} className="border border-white/5 p-4 opacity-40" style={{ borderRadius: 4 }}>
              <div className="flex items-center gap-2 mb-2">
                <span className="flex-shrink-0" style={{ width: 6, height: 6, background: "rgba(255,255,255,0.2)" }} />
                <span className="text-sm text-white/60">{q.label}</span>
              </div>
              <div className="w-full bg-white/10" style={{ height: 3, borderRadius: 0 }} />
            </div>
          ))}
        </div>
      </div>

      {/* ── Raffle ── */}
      <RaffleDisplay tickets={raffleTickets} />

      {/* ── Badge wall ── */}
      <div>
        <p
          className="mb-3 text-xs font-semibold text-white/50"
          style={{ fontFamily: "var(--font-display)", textTransform: "uppercase", letterSpacing: "0.1em" }}
        >
          Badge Wall
        </p>
        <BadgeWall earnedIds={earnedBadges} />
      </div>

      {/* ── Rivalries ── */}
      {rivalries && rivalries.length > 0 && (
        <div>
          <p
            className="mb-3 text-xs font-semibold text-white/50"
            style={{ fontFamily: "var(--font-display)", textTransform: "uppercase", letterSpacing: "0.1em" }}
          >
            Rivalries
          </p>
          <div className="space-y-2">
            {rivalries.slice(0, 3).map((rivalry, i) => {
              const total = rivalry.aWins + rivalry.bWins + rivalry.draws;
              return (
                <div
                  key={`${rivalry.walletA}-${rivalry.walletB}-${i}`}
                  className="flex items-center justify-between border border-white/8 bg-white/[0.02] p-3"
                  style={{ borderRadius: 4 }}
                >
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-semibold text-white">
                      {rivalry.walletA.slice(0, 6)}... vs {rivalry.walletB.slice(0, 6)}...
                    </span>
                    <span className="text-[10px] text-white/40">
                      {rivalry.narrativeTag}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="font-mono" style={{ color: "#00FF87" }}>{rivalry.aWins}W</span>
                    <span className="text-white/30">-</span>
                    <span className="font-mono" style={{ color: "#FF3D3D" }}>{rivalry.bWins}W</span>
                    {rivalry.draws > 0 && (
                      <>
                        <span className="text-white/30">-</span>
                        <span className="font-mono text-white/50">{rivalry.draws}D</span>
                      </>
                    )}
                    <span className="text-white/20">({total})</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
