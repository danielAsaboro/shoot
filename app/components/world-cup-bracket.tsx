"use client";

import { useState } from "react";
import type {
  FinalsBracket,
  FinalsMatch,
  LeaderboardEntry,
} from "@/lib/world-cup/types";
import type { AssetClassId } from "@/lib/world-cup/types";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Props {
  bracket: FinalsBracket;
  cupId: AssetClassId;
  divisionChampions?: LeaderboardEntry[];
  onBracketUpdate?: (bracket: FinalsBracket) => void;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const cupColors: Record<
  AssetClassId,
  { accent: string; dim: string; label: string }
> = {
  crypto: { accent: "#3D7FFF", dim: "#1a2a4f", label: "CRYPTO CUP" },
  metals: { accent: "#BFFF00", dim: "#2a3300", label: "METALS CUP" },
  energy: { accent: "#FF3D3D", dim: "#3d1111", label: "ENERGY CUP" },
  forex: { accent: "#00FF87", dim: "#0d2e1a", label: "FOREX CUP" },
};

// ── Trader slot ────────────────────────────────────────────────────────────────

function TraderSlot({
  entry,
  isWinner,
  isLive,
  accent,
  expanded,
  onToggle,
}: {
  entry?: LeaderboardEntry;
  isWinner?: boolean;
  isLive?: boolean;
  accent: string;
  expanded?: boolean;
  onToggle?: () => void;
}) {
  if (!entry) {
    return (
      <div
        className="flex h-12 items-center border border-dashed border-white/10 px-3 text-xs text-white/20"
        style={{ borderRadius: "2px" }}
      >
        TBD
      </div>
    );
  }

  return (
    <div>
      <div
        className="relative flex h-12 items-center justify-between border px-3 transition-all duration-300 cursor-pointer"
        onClick={onToggle}
        style={{
          borderRadius: "2px",
          background: isWinner
            ? "rgba(255,255,255,0.04)"
            : "rgba(255,255,255,0.02)",
          borderColor: isWinner ? `${accent}60` : "rgba(255,255,255,0.08)",
          borderLeft: isWinner ? `4px solid ${accent}` : undefined,
          boxShadow: isWinner ? `0 0 16px ${accent}22` : "none",
        }}
      >
        <div className="flex items-center gap-2 min-w-0">
          {isLive && (
            <span
              className="flex-shrink-0 animate-live-blink"
              style={{
                width: 6,
                height: 6,
                background: "#FF3D3D",
                borderRadius: "2px",
              }}
            />
          )}
          <div className="min-w-0">
            <p
              className={`text-xs font-bold truncate ${isWinner ? "text-white" : "text-white/70"}`}
              style={{ fontFamily: "var(--font-sans)" }}
            >
              {entry.trader.alias}
            </p>
            <p className="text-[10px] text-white/30 truncate">
              {entry.trader.name}
            </p>
          </div>
        </div>
        <div className="flex-shrink-0 text-right">
          <p
            className="text-xs font-bold"
            style={{
              fontFamily: "var(--font-mono)",
              color: isWinner ? accent : "rgba(255,255,255,0.5)",
            }}
          >
            {entry.score.toFixed(1)}
          </p>
          {!entry.eligible && (
            <p className="text-[9px] font-bold" style={{ color: "#FF3D3D" }}>
              FLAGGED
            </p>
          )}
        </div>
        {isWinner && (
          <div
            className="absolute -right-1 -top-1 text-[10px] leading-none flex items-center justify-center font-bold"
            style={{
              width: 18,
              height: 18,
              background: accent,
              color: "#050505",
              borderRadius: "2px",
            }}
          >
            ✓
          </div>
        )}
      </div>
      {expanded && (
        <div
          className="mt-1 grid grid-cols-2 gap-1 border border-white/5 bg-black/40 p-2 text-[10px]"
          style={{ borderRadius: "2px" }}
        >
          <div>
            <span className="text-white/40">RAROI:</span>{" "}
            <span
              className="text-white/70"
              style={{ fontFamily: "var(--font-mono)" }}
            >
              {entry.metrics.riskAdjustedPnl.toFixed(1)}
            </span>
          </div>
          <div>
            <span className="text-white/40">Win Rate:</span>{" "}
            <span
              className="text-white/70"
              style={{ fontFamily: "var(--font-mono)" }}
            >
              {entry.metrics.consistency.toFixed(0)}%
            </span>
          </div>
          <div>
            <span className="text-white/40">Trades:</span>{" "}
            <span
              className="text-white/70"
              style={{ fontFamily: "var(--font-mono)" }}
            >
              {entry.metrics.tradeCount}
            </span>
          </div>
          <div>
            <span className="text-white/40">Drawdown:</span>{" "}
            <span
              className="text-white/70"
              style={{ fontFamily: "var(--font-mono)" }}
            >
              {entry.metrics.drawdown.toFixed(1)}%
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Match block ────────────────────────────────────────────────────────────────

function simulateMatch(match: FinalsMatch): FinalsMatch {
  if (match.winner || !match.left || !match.right) return match;
  const leftScore = match.left.score + (Math.random() - 0.3) * 10;
  const rightScore = match.right.score + (Math.random() - 0.3) * 10;
  const winner = leftScore >= rightScore ? match.left : match.right;
  const margin = Math.abs(leftScore - rightScore);
  return { ...match, winner, margin: Number(margin.toFixed(1)) };
}

function MatchBlock({
  match,
  label,
  isLive,
  accent,
  onSimulate,
  expandedId,
  onToggleExpand,
}: {
  match: FinalsMatch;
  label: string;
  isLive?: boolean;
  accent: string;
  onSimulate?: () => void;
  expandedId?: string | null;
  onToggleExpand?: (id: string) => void;
}) {
  const marginText = match.winner ? `+${match.margin.toFixed(1)} pts` : null;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between mb-1.5">
        <p
          className="text-[10px] tracking-wider text-white/30 font-bold"
          style={{
            fontFamily: "var(--font-display)",
            textTransform: "uppercase",
          }}
        >
          {label}
        </p>
        {isLive && (
          <span
            className="flex items-center gap-1.5 text-[10px] font-bold"
            style={{ color: "#FF3D3D" }}
          >
            <span
              className="animate-live-blink"
              style={{
                width: 6,
                height: 6,
                background: "#FF3D3D",
                borderRadius: "2px",
                display: "inline-block",
              }}
            />
            LIVE
          </span>
        )}
        {marginText && (
          <span
            className="text-[10px] text-white/30"
            style={{ fontFamily: "var(--font-mono)" }}
          >
            {marginText} margin
          </span>
        )}
      </div>
      <TraderSlot
        entry={match.left}
        isWinner={match.winner?.trader.id === match.left?.trader.id}
        isLive={isLive}
        accent={accent}
        expanded={expandedId === match.left?.trader.id}
        onToggle={() => match.left && onToggleExpand?.(match.left.trader.id)}
      />
      <div className="flex items-center gap-2 px-3">
        <div
          className="flex-1 border-t"
          style={{ borderColor: `${accent}30` }}
        />
        {!match.winner && match.left && match.right ? (
          <button
            type="button"
            onClick={onSimulate}
            className="border border-white/20 bg-white/5 px-2.5 py-0.5 font-bold text-white/50 transition hover:border-white/40 hover:bg-white/10 hover:text-white"
            style={{
              borderRadius: "2px",
              fontFamily: "var(--font-display)",
              fontSize: "24px",
              lineHeight: "1.2",
              letterSpacing: "0.05em",
            }}
          >
            VS
          </button>
        ) : (
          <span
            className="font-bold text-white/20"
            style={{ fontFamily: "var(--font-display)", fontSize: "24px" }}
          >
            VS
          </span>
        )}
        <div
          className="flex-1 border-t"
          style={{ borderColor: `${accent}30` }}
        />
      </div>
      <TraderSlot
        entry={match.right}
        isWinner={match.winner?.trader.id === match.right?.trader.id}
        isLive={isLive}
        accent={accent}
        expanded={expandedId === match.right?.trader.id}
        onToggle={() => match.right && onToggleExpand?.(match.right.trader.id)}
      />
    </div>
  );
}

// ── Finals bracket constants ────────────────────────────────────────────────────

// Height of one SF slot — Final gets 2× (centered between both SFs)
const SF_CELL_H = 200;
const SF_TOTAL_H = 2 * SF_CELL_H;
const SF_CONNECTOR_W = 32;

// ── Main bracket ──────────────────────────────────────────────────────────────

export function WorldCupBracket({
  bracket,
  cupId,
  divisionChampions,
  onBracketUpdate,
}: Props) {
  const c = cupColors[cupId];
  const [liveBracket, setLiveBracket] = useState<FinalsBracket>(bracket);
  const [expandedTraderId, setExpandedTraderId] = useState<string | null>(null);
  const [redemptionMatch, setRedemptionMatch] = useState<FinalsMatch | null>(
    null
  );

  // Sync with props when bracket changes externally
  const bracketKey = JSON.stringify({
    sf: bracket.semiFinals.map((m) => m.winner?.trader.id),
    f: bracket.final.winner?.trader.id,
  });
  const [lastBracketKey, setLastBracketKey] = useState(bracketKey);
  if (bracketKey !== lastBracketKey) {
    setLiveBracket(bracket);
    setLastBracketKey(bracketKey);
  }

  const { semiFinals, final: finalMatch } = liveBracket;

  function handleSimulateSemiFinal(index: number) {
    const updated = { ...liveBracket, semiFinals: [...liveBracket.semiFinals] };
    updated.semiFinals[index] = simulateMatch(updated.semiFinals[index]);

    // If both semis are resolved, populate the final
    if (updated.semiFinals.every((sf) => sf.winner)) {
      updated.final = {
        ...updated.final,
        left: updated.semiFinals[0].winner,
        right: updated.semiFinals[1].winner,
      };
    }
    setLiveBracket(updated);
    onBracketUpdate?.(updated);
  }

  function handleSimulateFinal() {
    const updated = { ...liveBracket, final: simulateMatch(liveBracket.final) };
    setLiveBracket(updated);
    onBracketUpdate?.(updated);
  }

  function handleSimulateAll() {
    const updated = { ...liveBracket, semiFinals: [...liveBracket.semiFinals] };
    for (let i = 0; i < updated.semiFinals.length; i++) {
      if (!updated.semiFinals[i].winner) {
        updated.semiFinals[i] = simulateMatch(updated.semiFinals[i]);
      }
    }
    if (updated.semiFinals.every((sf) => sf.winner)) {
      updated.final = {
        ...updated.final,
        left: updated.semiFinals[0].winner,
        right: updated.semiFinals[1].winner,
      };
      if (!updated.final.winner) {
        updated.final = simulateMatch(updated.final);
      }
    }
    setLiveBracket(updated);
    onBracketUpdate?.(updated);
  }

  function toggleExpand(id: string) {
    setExpandedTraderId((prev) => (prev === id ? null : id));
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div
          className="flex h-9 w-9 items-center justify-center text-xs font-bold"
          style={{
            borderRadius: "2px",
            background: `${c.accent}18`,
            border: `2px solid ${c.accent}60`,
            color: c.accent,
            fontFamily: "var(--font-display)",
            letterSpacing: "0.05em",
          }}
        >
          ▸
        </div>
        <div>
          <p
            className="text-[10px] tracking-wider text-white/40"
            style={{
              fontFamily: "var(--font-display)",
              textTransform: "uppercase",
            }}
          >
            FINALS BRACKET
          </p>
          <h3
            className="font-bold text-white text-lg"
            style={{
              fontFamily: "var(--font-display)",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            {c.label}
          </h3>
        </div>
        <div
          className="ml-auto flex items-center gap-1.5 px-3 py-1 text-xs font-bold"
          style={{
            borderRadius: "2px",
            background: `${c.accent}15`,
            color: c.accent,
            border: `1px solid ${c.accent}40`,
            fontFamily: "var(--font-display)",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
          }}
        >
          <span
            className="animate-live-blink"
            style={{
              width: 6,
              height: 6,
              background: c.accent,
              borderRadius: "2px",
              display: "inline-block",
            }}
          />
          FINALS WEEK
        </div>
      </div>

      {/* Bracket layout */}
      <div className="overflow-x-auto">
        <div className="flex items-start w-full">
          {/* Semi-finals column */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <p
              className="text-center text-[10px] tracking-wider text-white/30 mb-2 font-bold"
              style={{
                fontFamily: "var(--font-display)",
                textTransform: "uppercase",
              }}
            >
              SEMI-FINALS
            </p>
            <div style={{ height: SF_TOTAL_H }}>
              {semiFinals.map((match, i) => (
                <div
                  key={i}
                  style={{
                    height: SF_CELL_H,
                    display: "flex",
                    alignItems: "center",
                    padding: "0 4px",
                  }}
                >
                  <div className="w-full">
                    <MatchBlock
                      match={match}
                      label={`SF ${i + 1}`}
                      isLive={!match.winner}
                      accent={c.accent}
                      onSimulate={() => handleSimulateSemiFinal(i)}
                      expandedId={expandedTraderId}
                      onToggleExpand={toggleExpand}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Connector — single SVG spanning full height */}
          <svg
            width={SF_CONNECTOR_W}
            height={SF_TOTAL_H}
            viewBox={`0 0 ${SF_CONNECTOR_W} ${SF_TOTAL_H}`}
            fill="none"
            style={{ flexShrink: 0, marginTop: 24 }}
          >
            {/* SF1 center → midpoint */}
            <path
              d={`M 0 ${SF_CELL_H * 0.5} H ${SF_CONNECTOR_W / 2}`}
              stroke={c.accent}
              strokeWidth="3"
            />
            {/* SF2 center → midpoint */}
            <path
              d={`M 0 ${SF_CELL_H * 1.5} H ${SF_CONNECTOR_W / 2}`}
              stroke={c.accent}
              strokeWidth="3"
            />
            {/* Vertical bar joining them */}
            <path
              d={`M ${SF_CONNECTOR_W / 2} ${SF_CELL_H * 0.5} V ${SF_CELL_H * 1.5}`}
              stroke={c.accent}
              strokeWidth="3"
            />
            {/* Output line to Final at midpoint = SF_TOTAL_H / 2 */}
            <path
              d={`M ${SF_CONNECTOR_W / 2} ${SF_TOTAL_H / 2} H ${SF_CONNECTOR_W}`}
              stroke={c.accent}
              strokeWidth="3"
            />
          </svg>

          {/* Final column */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <p
              className="text-center text-[10px] tracking-wider text-white/30 mb-2 font-bold"
              style={{
                fontFamily: "var(--font-display)",
                textTransform: "uppercase",
              }}
            >
              GRAND FINAL
            </p>
            <div
              style={{
                height: SF_TOTAL_H,
                display: "flex",
                alignItems: "center",
                padding: "0 4px",
              }}
            >
              <div
                className="w-full border p-4"
                style={{
                  borderRadius: "0px",
                  background: `${c.accent}08`,
                  borderColor: `${c.accent}30`,
                  borderTop: `4px solid ${c.accent}`,
                  boxShadow: `0 0 60px ${c.accent}25, 0 0 120px ${c.accent}10`,
                }}
              >
                <MatchBlock
                  match={finalMatch}
                  label="Champion"
                  isLive={!finalMatch.winner}
                  accent={c.accent}
                  onSimulate={handleSimulateFinal}
                  expandedId={expandedTraderId}
                  onToggleExpand={toggleExpand}
                />
                {finalMatch.winner && (
                  <div
                    className="mt-4 border p-4 text-center"
                    style={{
                      borderRadius: "2px",
                      background: `${c.accent}12`,
                      borderColor: `${c.accent}44`,
                    }}
                  >
                    <p
                      className="font-bold tracking-widest mb-1"
                      style={{
                        fontFamily: "var(--font-display)",
                        fontSize: "0.75rem",
                        color: c.accent,
                        textTransform: "uppercase",
                        letterSpacing: "0.2em",
                      }}
                    >
                      CHAMPION
                    </p>
                    <p
                      className="font-bold text-white"
                      style={{
                        fontFamily: "var(--font-display)",
                        fontSize: "2rem",
                        lineHeight: "1.1",
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                      }}
                    >
                      {finalMatch.winner.trader.alias}
                    </p>
                    <p className="text-xs text-white/50 mt-1">
                      {finalMatch.winner.trader.name}
                    </p>
                    <p
                      className="mt-2 font-bold"
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: "1.5rem",
                        color: c.accent,
                      }}
                    >
                      {finalMatch.winner.score.toFixed(1)} pts
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Simulate all button */}
      {(!semiFinals.every((sf) => sf.winner) || !finalMatch.winner) && (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={handleSimulateAll}
            className="border border-white/20 bg-white/5 px-5 py-2 text-xs font-bold text-white/60 transition hover:border-white/40 hover:bg-white/10 hover:text-white"
            style={{
              borderRadius: "2px",
              fontFamily: "var(--font-display)",
              textTransform: "uppercase",
              letterSpacing: "0.1em",
            }}
          >
            SIMULATE ROUND →
          </button>
        </div>
      )}

      {/* Redemption bracket */}
      {(() => {
        const sfLosers = semiFinals
          .filter((sf) => sf.winner && sf.left && sf.right)
          .map((sf) =>
            sf.winner!.trader.id === sf.left!.trader.id ? sf.right! : sf.left!
          );
        if (sfLosers.length < 2) {
          return (
            <div
              className="border border-white/5 bg-white/[0.015] p-4"
              style={{ borderRadius: "4px" }}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p
                    className="text-xs font-bold text-white/60"
                    style={{
                      fontFamily: "var(--font-display)",
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                    }}
                  >
                    REDEMPTION BRACKET
                  </p>
                  <p className="text-[11px] text-white/30">
                    All SF losers continue here · Separate prize pool ·
                    &ldquo;Comeback&rdquo; badge for winner
                  </p>
                </div>
                <span
                  className="px-3 py-1 text-[10px] font-bold text-white/40 border border-white/10"
                  style={{
                    borderRadius: "2px",
                    fontFamily: "var(--font-display)",
                    textTransform: "uppercase",
                  }}
                >
                  WAITING FOR SF RESULTS
                </span>
              </div>
            </div>
          );
        }
        const rm = redemptionMatch ?? {
          label: "Redemption",
          left: sfLosers[0],
          right: sfLosers[1],
          margin: 0,
        };
        return (
          <div
            className="border p-4"
            style={{
              borderRadius: "4px",
              borderColor: "rgba(191,255,0,0.15)",
              background: "rgba(191,255,0,0.03)",
            }}
          >
            <div className="flex items-center justify-between mb-3">
              <div>
                <p
                  className="text-xs font-bold"
                  style={{
                    color: "#BFFF00",
                    fontFamily: "var(--font-display)",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                  }}
                >
                  REDEMPTION BRACKET
                </p>
                <p className="text-[11px] text-white/30">
                  SF losers compete · Winner earns &ldquo;Comeback&rdquo; badge
                </p>
              </div>
              {rm.winner && (
                <span
                  className="px-2 py-0.5 text-[10px] font-bold border"
                  style={{
                    borderRadius: "2px",
                    background: "rgba(191,255,0,0.12)",
                    color: "#BFFF00",
                    borderColor: "rgba(191,255,0,0.30)",
                    fontFamily: "var(--font-display)",
                    textTransform: "uppercase",
                  }}
                >
                  COMEBACK: {rm.winner.trader.alias}
                </span>
              )}
            </div>
            <MatchBlock
              match={rm}
              label="Redemption"
              isLive={!rm.winner}
              accent="#BFFF00"
              onSimulate={() => setRedemptionMatch(simulateMatch(rm))}
              expandedId={expandedTraderId}
              onToggleExpand={toggleExpand}
            />
          </div>
        );
      })()}

      {/* Grand Championship teaser */}
      {divisionChampions && divisionChampions.length > 0 && (
        <div
          className="border p-5"
          style={{
            borderRadius: "4px",
            background:
              "linear-gradient(135deg, rgba(0,240,255,0.06), rgba(0,240,255,0.02))",
            borderColor: "rgba(0,240,255,0.25)",
            boxShadow: "0 0 60px rgba(0,240,255,0.08)",
          }}
        >
          <div className="flex items-center gap-3 mb-4">
            <div
              className="flex items-center justify-center font-bold"
              style={{
                width: 40,
                height: 40,
                borderRadius: "2px",
                background: "rgba(0,240,255,0.10)",
                border: "2px solid rgba(0,240,255,0.30)",
                color: "#00F0FF",
                fontFamily: "var(--font-display)",
                fontSize: "18px",
              }}
            >
              ◆
            </div>
            <div>
              <p
                className="font-bold text-white text-lg"
                style={{
                  fontFamily: "var(--font-display)",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                }}
              >
                GRAND CHAMPIONSHIP
              </p>
              <p className="text-xs text-white/40">
                4 Division Champions · 48-hour battle across all markets
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {divisionChampions.map((champ) => {
              const cc =
                cupColors[champ.trader.specialization as AssetClassId] ??
                cupColors.crypto;
              return (
                <div
                  key={champ.trader.id}
                  className="border p-3 text-center"
                  style={{
                    borderRadius: "4px",
                    background: `${cc.accent}10`,
                    borderColor: `${cc.accent}30`,
                  }}
                >
                  <p
                    className="text-[10px] font-bold mb-1"
                    style={{
                      color: cc.accent,
                      fontFamily: "var(--font-display)",
                      textTransform: "uppercase",
                      letterSpacing: "0.1em",
                    }}
                  >
                    {cc.label.replace(" CUP", "")}
                  </p>
                  <p className="text-xs font-bold text-white mt-1">
                    {champ.trader.alias}
                  </p>
                  <p className="text-[10px] text-white/40">
                    {champ.trader.name}
                  </p>
                </div>
              );
            })}
          </div>
          <div
            className="mt-4 flex items-center justify-between border px-4 py-2"
            style={{
              borderRadius: "4px",
              borderColor: "rgba(0,240,255,0.20)",
              background: "rgba(0,240,255,0.05)",
            }}
          >
            <span
              className="text-xs font-bold"
              style={{
                color: "#00F0FF",
                fontFamily: "var(--font-display)",
                textTransform: "uppercase",
              }}
            >
              GRAND CHAMPION PRIZE
            </span>
            <span
              className="text-sm font-bold"
              style={{ fontFamily: "var(--font-mono)", color: "#00F0FF" }}
            >
              50,000 ADX + 500 USDC
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
