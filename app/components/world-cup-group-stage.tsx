"use client";

import { useState } from "react";
import type {
  AssetClassId,
  Group,
  GroupMatch,
  GroupStanding,
} from "@/lib/world-cup/types";

const cupColors: Record<
  AssetClassId,
  { accent: string; dim: string; label: string }
> = {
  crypto: { accent: "#3D7FFF", dim: "#1e3a5f", label: "Crypto Cup" },
  metals: { accent: "#BFFF00", dim: "#3d2a00", label: "Metals Cup" },
  energy: { accent: "#FF3D3D", dim: "#3d1500", label: "Energy Cup" },
  forex: { accent: "#00FF87", dim: "#0d2e0d", label: "Forex Cup" },
};

function StandingRow({
  standing,
  position,
  accent,
}: {
  standing: GroupStanding;
  position: number;
  accent: string;
}) {
  const qualified = standing.qualified;
  const isWinner = standing.groupWinner;

  return (
    <tr
      className="border-b border-white/5 transition-colors hover:bg-white/[0.03]"
      style={{
        background: isWinner
          ? `${accent}12`
          : qualified
            ? `${accent}08`
            : "transparent",
        borderLeft: qualified ? `3px solid ${accent}` : "3px solid transparent",
      }}
    >
      <td className="px-2 py-2 text-center" style={{ fontSize: "1rem" }}>
        <span className="font-display font-bold text-white/60">
          {position}
        </span>
        {isWinner && (
          <span
            className="ml-1 inline-block"
            style={{
              width: "6px",
              height: "6px",
              borderRadius: "2px",
              background: accent,
            }}
          />
        )}
      </td>
      <td className="px-2 py-2">
        <p className="text-xs font-bold text-white truncate max-w-[100px]">
          {standing.trader.alias}
        </p>
        <p className="text-[10px] text-white/30 truncate font-sans">
          {standing.trader.name}
        </p>
      </td>
      <td className="px-2 py-2 text-center font-mono text-xs text-white/60">
        {standing.played}
      </td>
      <td className="px-2 py-2 text-center font-mono text-xs text-white/60">
        {standing.won}
      </td>
      <td className="px-2 py-2 text-center font-mono text-xs text-white/60">
        {standing.drawn}
      </td>
      <td className="px-2 py-2 text-center font-mono text-xs text-white/60">
        {standing.lost}
      </td>
      <td className="px-2 py-2 text-center font-mono text-xs font-bold" style={{ color: accent }}>
        {standing.points}
      </td>
      <td
        className="px-2 py-2 text-center font-mono text-xs"
        style={{
          color:
            standing.raroiDifference > 0
              ? "#00FF87"
              : standing.raroiDifference < 0
                ? "#FF3D3D"
                : "rgba(255,255,255,0.4)",
        }}
      >
        {standing.raroiDifference > 0 ? "+" : ""}
        {standing.raroiDifference.toFixed(1)}
      </td>
    </tr>
  );
}

function MatchResult({ match }: { match: GroupMatch }) {
  return (
    <div
      className="flex items-center justify-between gap-2 border border-white/5 bg-black/20 px-3 py-2"
      style={{ borderRadius: "2px" }}
    >
      <div className="flex-1 text-right">
        <p
          className={`text-xs font-bold ${
            match.result === "win" ? "text-white" : "text-white/50"
          }`}
        >
          {match.traderA.alias}
        </p>
      </div>
      <div className="flex items-center gap-1.5 px-2">
        <span
          className="font-mono font-bold"
          style={{
            fontSize: "0.875rem",
            color:
              match.result === "win"
                ? "#00FF87"
                : match.result === "draw"
                  ? "#BFFF00"
                  : "rgba(255,255,255,0.4)",
          }}
        >
          {match.raroiA.toFixed(1)}
        </span>
        <span className="text-[10px] text-white/20">-</span>
        <span
          className="font-mono font-bold"
          style={{
            fontSize: "0.875rem",
            color:
              match.result === "loss"
                ? "#00FF87"
                : match.result === "draw"
                  ? "#BFFF00"
                  : "rgba(255,255,255,0.4)",
          }}
        >
          {match.raroiB.toFixed(1)}
        </span>
      </div>
      <div className="flex-1">
        <p
          className={`text-xs font-bold ${
            match.result === "loss" ? "text-white" : "text-white/50"
          }`}
        >
          {match.traderB.alias}
        </p>
      </div>
    </div>
  );
}

function GroupCard({
  group,
  accent,
}: {
  group: Group;
  accent: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const matchdays = [1, 2, 3];

  return (
    <div
      className="border overflow-hidden"
      style={{
        borderRadius: "4px",
        background: group.isGroupOfDeath
          ? "rgba(255,61,61,0.04)"
          : "#0a0a0a",
        borderColor: group.isGroupOfDeath
          ? "rgba(255,61,61,0.25)"
          : "rgba(255,255,255,0.08)",
      }}
    >
      {/* Group of Death banner */}
      {group.isGroupOfDeath && (
        <div
          className="w-full px-3 py-1.5 font-display text-[10px] font-bold uppercase tracking-widest"
          style={{
            background: "rgba(255,61,61,0.15)",
            color: "#FF3D3D",
            borderRadius: "2px",
          }}
        >
          GROUP OF DEATH
        </div>
      )}

      <div className="p-4">
        <div className="flex items-start justify-between mb-3 gap-2">
          <h4 className="text-sm font-display font-bold text-white uppercase tracking-wide">
            {group.label}
          </h4>
          <span className="font-mono text-[10px] text-white/30 shrink-0">
            Avg seed: {group.seedStrength.toFixed(1)}
          </span>
        </div>

        {/* League table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-white/10">
                <th className="px-2 py-1.5 font-display text-[10px] uppercase tracking-wider text-white/30 text-center">
                  #
                </th>
                <th className="px-2 py-1.5 font-display text-[10px] uppercase tracking-wider text-white/30">
                  Trader
                </th>
                <th className="px-2 py-1.5 font-display text-[10px] uppercase tracking-wider text-white/30 text-center">
                  P
                </th>
                <th className="px-2 py-1.5 font-display text-[10px] uppercase tracking-wider text-white/30 text-center">
                  W
                </th>
                <th className="px-2 py-1.5 font-display text-[10px] uppercase tracking-wider text-white/30 text-center">
                  D
                </th>
                <th className="px-2 py-1.5 font-display text-[10px] uppercase tracking-wider text-white/30 text-center">
                  L
                </th>
                <th className="px-2 py-1.5 font-display text-[10px] uppercase tracking-wider text-white/30 text-center">
                  Pts
                </th>
                <th className="px-2 py-1.5 font-display text-[10px] uppercase tracking-wider text-white/30 text-center">
                  +/-
                </th>
              </tr>
            </thead>
            <tbody>
              {group.standings.map((standing, i) => (
                <StandingRow
                  key={standing.trader.id}
                  standing={standing}
                  position={i + 1}
                  accent={accent}
                />
              ))}
            </tbody>
          </table>
        </div>

        {/* Expand match results */}
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="mt-3 w-full border border-white/10 bg-white/[0.03] px-3 py-1.5 font-display text-[10px] font-bold uppercase tracking-wider text-white/40 transition hover:bg-white/[0.06] hover:text-white/60"
          style={{ borderRadius: "2px" }}
        >
          {expanded ? "HIDE MATCHES" : "SHOW MATCHES"}
        </button>

        {expanded && (
          <div className="mt-3 space-y-3">
            {matchdays.map((day) => {
              const dayMatches = group.matches.filter(
                (m) => m.matchday === day
              );
              return (
                <div key={day}>
                  <p className="font-display text-[10px] uppercase tracking-wider text-white/30 mb-1.5">
                    Matchday {day}
                  </p>
                  <div className="space-y-1.5">
                    {dayMatches.map((match, i) => (
                      <MatchResult key={i} match={match} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export function WorldCupGroupStage({
  groups,
  cupId,
}: {
  groups: Group[];
  cupId: AssetClassId;
}) {
  const c = cupColors[cupId];
  const groupOfDeathCount = groups.filter((g) => g.isGroupOfDeath).length;
  const qualifiedCount = groups.reduce(
    (sum, g) => sum + g.standings.filter((s) => s.qualified).length,
    0
  );

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="font-display text-[10px] uppercase tracking-[0.2em] text-white/40">
            Group Stage
          </p>
          <h3 className="font-display font-bold text-white uppercase tracking-wide">{c.label}</h3>
        </div>
        <div className="flex items-center gap-3">
          <span
            className="border border-white/10 bg-white/5 px-3 py-1 text-[10px] font-bold text-white/50"
            style={{ borderRadius: "2px" }}
          >
            {qualifiedCount} qualified
          </span>
          {groupOfDeathCount > 0 && (
            <span
              className="px-3 py-1 text-[10px] font-bold border"
              style={{
                borderRadius: "2px",
                background: "rgba(255,61,61,0.15)",
                color: "#FF3D3D",
                borderColor: "rgba(255,61,61,0.2)",
              }}
            >
              {groupOfDeathCount} Group{groupOfDeathCount > 1 ? "s" : ""} of
              Death
            </span>
          )}
        </div>
      </div>

      {/* Groups in responsive 2x4 grid */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {groups.map((group) => (
          <GroupCard key={group.id} group={group} accent={c.accent} />
        ))}
      </div>
    </div>
  );
}
