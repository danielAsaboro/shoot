"use client";

import { FUNDED_LADDER } from "@/lib/competition/funded-ladder";
import type { FundedDeskConfig, FundedDeskLevel } from "@/lib/competition/types";

// ── Props ────────────────────────────────────────────────────────────────────

interface FundedDeskProps {
  currentLevel: FundedDeskLevel | "none";
  promotionProgress: number;
  seasonPoints: number;
  revenueShareBps: number;
}

// ── Level Colors ─────────────────────────────────────────────────────────────

const LEVEL_COLORS: Record<FundedDeskLevel, string> = {
  watchlist: "#3D7FFF",
  funded: "#00FF87",
  senior_funded: "#BF5AF2",
  captain: "#BFFF00",
  partner: "#00F0FF",
};

// ── Tier Card ────────────────────────────────────────────────────────────────

function LadderTierCard({
  config,
  isActive,
  isPast,
}: {
  config: FundedDeskConfig;
  isActive: boolean;
  isPast: boolean;
}) {
  const color = LEVEL_COLORS[config.level];

  return (
    <div
      className="border p-4 transition"
      style={{
        borderRadius: 4,
        background: isActive
          ? `${color}10`
          : isPast
            ? `${color}05`
            : "rgba(255,255,255,0.02)",
        borderColor: isActive ? `${color}40` : isPast ? `${color}15` : "rgba(255,255,255,0.08)",
        opacity: isPast || isActive ? 1 : 0.5,
      }}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div
            className="h-3 w-3"
            style={{ background: color }}
          />
          <span className="text-sm font-bold" style={{ color: isActive ? color : "white" }}>
            {config.label}
          </span>
        </div>
        {isActive && (
          <span
            className="px-2 py-0.5 text-[9px] font-bold"
            style={{ background: `${color}22`, color }}
          >
            CURRENT
          </span>
        )}
        {isPast && !isActive && (
          <span className="text-[9px] font-bold" style={{ color: "#00FF87" }}>EARNED</span>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2 text-xs mb-3">
        <div>
          <p className="text-white/40">Points</p>
          <p className="font-mono font-semibold">{config.pointsThreshold.toLocaleString()}</p>
        </div>
        <div>
          <p className="text-white/40">Min Finish</p>
          <p className="font-mono font-semibold">Top {config.minFinish}</p>
        </div>
        <div>
          <p className="text-white/40">Active Weeks</p>
          <p className="font-mono font-semibold">{config.minConsecutiveWeeks}</p>
        </div>
      </div>

      <div className="text-xs">
        <p className="text-white/40">Projected Rev Share</p>
        <p className="font-semibold">{config.revenueShareBps} bps</p>
      </div>

      {config.perks.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1">
          {config.perks.map((perk) => (
            <span
              key={perk}
              className="rounded px-1.5 py-0.5 text-[9px] text-white/50"
              style={{ background: "rgba(255,255,255,0.04)" }}
            >
              {perk}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────

export function CompetitionFundedDesk({
  currentLevel,
  promotionProgress,
  seasonPoints,
  revenueShareBps,
}: FundedDeskProps) {
  const currentIdx = FUNDED_LADDER.findIndex((c) => c.level === currentLevel);

  return (
    <div className="space-y-6">
      {/* Design-phase notice */}
      <div style={{ borderRadius: 4, border: "1px solid rgba(0,240,255,0.2)", background: "rgba(0,240,255,0.05)", padding: "0.75rem 1rem", fontSize: "0.75rem", color: "rgba(0,240,255,0.8)" }}>
        <strong style={{ color: "#00F0FF" }}>Design Proposal</strong> — The
        evaluation engine is implemented. Revenue share distribution and
        on-chain capital allocation require protocol integration.{" "}
        <a href="/docs/funded-trader-proposal.md" className="underline underline-offset-2" style={{ color: "#00F0FF" }}>
          See integration path →
        </a>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="stat-card">
          <span>Current Level</span>
          <strong style={{ color: currentLevel !== "none" ? LEVEL_COLORS[currentLevel as FundedDeskLevel] : "#94a3b8" }}>
            {currentLevel === "none" ? "Unranked" : FUNDED_LADDER.find((c) => c.level === currentLevel)?.label ?? currentLevel}
          </strong>
        </div>
        <div className="stat-card">
          <span>Season Points</span>
          <strong>{seasonPoints.toLocaleString()}</strong>
        </div>
        <div className="stat-card">
          <span>Projected Rev Share</span>
          <strong>{revenueShareBps} bps</strong>
        </div>
      </div>

      {/* Promotion progress bar */}
      {currentIdx < FUNDED_LADDER.length - 1 && currentIdx >= 0 && (
        <div className="border border-white/10 bg-white/[0.02] p-4" style={{ borderRadius: 4 }}>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-white/50">
              Promotion Progress
            </p>
            <span className="text-xs text-white/60">
              Next: {FUNDED_LADDER[currentIdx + 1].label}
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden bg-white/10">
            <div
              className="h-full transition-all duration-700"
              style={{
                width: `${Math.min(promotionProgress * 100, 100)}%`,
                background: `linear-gradient(90deg, ${LEVEL_COLORS[currentLevel as FundedDeskLevel] ?? "#6366f1"}88, ${LEVEL_COLORS[currentLevel as FundedDeskLevel] ?? "#6366f1"})`,
              }}
            />
          </div>
          <p className="mt-1.5 text-[10px] text-white/30">
            {(promotionProgress * 100).toFixed(0)}% — meet points, finish, and active weeks requirements
          </p>
        </div>
      )}

      {/* 5-Tier Ladder */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-white/50 mb-3">
          Funded Desk Ladder
        </p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {FUNDED_LADDER.map((config, idx) => (
            <LadderTierCard
              key={config.level}
              config={config}
              isActive={idx === currentIdx}
              isPast={idx < currentIdx}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
