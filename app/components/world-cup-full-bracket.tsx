"use client";

import type {
  AssetClassId,
  GroupStageBracket,
  KnockoutMatch,
  LeaderboardEntry,
  MarketTwist,
} from "@/lib/world-cup/types";

const cupColors: Record<
  AssetClassId,
  { accent: string; dim: string; label: string; icon: string }
> = {
  crypto: { accent: "#3D7FFF", dim: "#1a2a4f", label: "CRYPTO CUP", icon: "₿" },
  metals: { accent: "#BFFF00", dim: "#2a3300", label: "METALS CUP", icon: "◆" },
  energy: { accent: "#FF3D3D", dim: "#3d1111", label: "ENERGY CUP", icon: "▲" },
  forex: { accent: "#00FF87", dim: "#0d2e1a", label: "FOREX CUP", icon: "◎" },
};

function MatchBadges({ match }: { match: KnockoutMatch }) {
  return (
    <div className="flex flex-wrap gap-1">
      {match.twistMarket && (
        <span
          className="border px-1.5 py-0.5 text-[9px] font-bold"
          style={{
            borderRadius: "2px",
            background: "rgba(0,240,255,0.08)",
            color: "#00F0FF",
            borderColor: "rgba(0,240,255,0.25)",
            fontFamily: "var(--font-display)",
            textTransform: "uppercase",
          }}
        >
          {match.twistMarket}
        </span>
      )}
    </div>
  );
}

function KnockoutMatchBlock({
  match,
  accent,
}: {
  match: KnockoutMatch;
  accent: string;
}) {
  const isResolved = !!match.winner;

  return (
    <div
      className="border p-2.5 w-full"
      style={{
        borderRadius: "2px",
        background: isResolved ? `${accent}06` : "rgba(255,255,255,0.02)",
        borderColor: isResolved ? `${accent}20` : "rgba(255,255,255,0.08)",
      }}
    >
      {/* Left trader */}
      <TraderLine
        entry={match.left}
        isWinner={match.winner?.trader.id === match.left?.trader.id}
        accent={accent}
      />

      <div className="flex items-center gap-2 px-3 my-1">
        <div
          className="flex-1 border-t"
          style={{ borderColor: `${accent}30` }}
        />
        <span
          className="font-bold text-white/20"
          style={{
            fontFamily: "var(--font-display)",
            fontSize: "24px",
            lineHeight: "1.2",
          }}
        >
          VS
        </span>
        <div
          className="flex-1 border-t"
          style={{ borderColor: `${accent}30` }}
        />
      </div>

      {/* Right trader */}
      <TraderLine
        entry={match.right}
        isWinner={match.winner?.trader.id === match.right?.trader.id}
        accent={accent}
      />

      {/* Badges */}
      <div className="mt-1.5">
        <MatchBadges match={match} />
      </div>

      {/* Margin */}
      {isResolved && (
        <p
          className="mt-1 text-[9px] text-white/25 text-center"
          style={{ fontFamily: "var(--font-mono)" }}
        >
          +{match.margin.toFixed(1)} margin
        </p>
      )}
    </div>
  );
}

function TraderLine({
  entry,
  isWinner,
  accent,
}: {
  entry?: LeaderboardEntry;
  isWinner?: boolean;
  accent: string;
}) {
  if (!entry) {
    return (
      <div
        className="flex h-8 items-center px-3 text-[10px] text-white/20"
        style={{
          borderRadius: "2px",
          border: "1px dashed rgba(255,255,255,0.08)",
        }}
      >
        TBD
      </div>
    );
  }

  return (
    <div
      className="relative flex h-8 items-center justify-between px-3"
      style={{
        borderRadius: "2px",
        background: isWinner ? "rgba(255,255,255,0.04)" : "transparent",
        border: isWinner ? `1px solid ${accent}40` : "1px solid transparent",
        borderLeft: isWinner ? `4px solid ${accent}` : "1px solid transparent",
        boxShadow: isWinner ? `0 0 16px ${accent}22` : "none",
      }}
    >
      <div className="flex items-center gap-2 min-w-0">
        {isWinner && (
          <div
            className="flex-shrink-0 flex items-center justify-center text-[8px] font-bold"
            style={{
              width: 14,
              height: 14,
              background: accent,
              color: "#050505",
              borderRadius: "2px",
            }}
          >
            ✓
          </div>
        )}
        <span
          className={`text-[11px] font-bold truncate ${isWinner ? "text-white" : "text-white/50"}`}
          style={{ fontFamily: "var(--font-sans)" }}
        >
          {entry.trader.alias}
        </span>
      </div>
      <span
        className="flex-shrink-0"
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "10px",
          fontWeight: 700,
          color: isWinner ? accent : "rgba(255,255,255,0.35)",
        }}
      >
        {entry.score.toFixed(1)}
      </span>
    </div>
  );
}

// Height of one R16 slot in px — all later rounds multiply by 2^n
const CELL_H = 152;
const CONNECTOR_W = 32;

function BracketConnector({
  inputCount,
  accent,
}: {
  inputCount: number; // 8 R16→QF, 4 QF→SF, 2 SF→Final
  accent: string;
}) {
  // inputCellMultiple: how many CELL_H slots each input match occupies
  // R16 matches → 1×, QF matches → 2×, SF matches → 4×
  const inputCellMultiple = 8 / inputCount;
  const outputCount = inputCount / 2;
  const totalH = 8 * CELL_H; // always span the full bracket height
  const paths: string[] = [];

  for (let i = 0; i < outputCount; i++) {
    // centers of the two input matches feeding into output i
    const y1 = inputCellMultiple * (2 * i + 0.5) * CELL_H;
    const y2 = inputCellMultiple * (2 * i + 1.5) * CELL_H;
    const yMid = inputCellMultiple * (2 * i + 1) * CELL_H;
    const xMid = CONNECTOR_W / 2;
    paths.push(`M 0 ${y1} H ${xMid}`);
    paths.push(`M 0 ${y2} H ${xMid}`);
    paths.push(`M ${xMid} ${y1} V ${y2}`);
    paths.push(`M ${xMid} ${yMid} H ${CONNECTOR_W}`);
  }

  return (
    <svg
      width={CONNECTOR_W}
      height={totalH}
      viewBox={`0 0 ${CONNECTOR_W} ${totalH}`}
      fill="none"
      style={{ flexShrink: 0, marginTop: 24 }}
    >
      {paths.map((d, i) => (
        <path key={i} d={d} stroke={accent} strokeWidth="3" opacity="1" />
      ))}
    </svg>
  );
}

function BracketRoundColumn({
  label,
  matches,
  cellMultiple,
  accent,
}: {
  label: string;
  matches: KnockoutMatch[];
  cellMultiple: number; // 1 for R16, 2 for QF, 4 for SF
  accent: string;
}) {
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <p
        className="text-center text-[10px] tracking-wider text-white/30 mb-1.5 font-bold"
        style={{
          fontFamily: "var(--font-display)",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
        }}
      >
        {label}
      </p>
      <div style={{ height: 8 * CELL_H }}>
        {matches.map((match) => (
          <div
            key={match.id}
            style={{
              height: cellMultiple * CELL_H,
              display: "flex",
              alignItems: "center",
              padding: "0 4px",
            }}
          >
            <KnockoutMatchBlock match={match} accent={accent} />
          </div>
        ))}
      </div>
    </div>
  );
}

function TwistBanner({ twist }: { twist: MarketTwist }) {
  return (
    <div
      className="border p-3 text-center"
      style={{
        borderRadius: "4px",
        borderColor: "rgba(0,240,255,0.20)",
        background: "rgba(0,240,255,0.04)",
      }}
    >
      <p
        className="text-[10px] tracking-wider font-bold"
        style={{
          fontFamily: "var(--font-display)",
          textTransform: "uppercase",
          color: "rgba(0,240,255,0.50)",
          letterSpacing: "0.1em",
        }}
      >
        MARKET TWIST
      </p>
      <p
        className="text-sm font-bold mt-1"
        style={{
          fontFamily: "var(--font-display)",
          textTransform: "uppercase",
          color: "#00F0FF",
        }}
      >
        {twist.label}
      </p>
      <p
        className="text-xs text-white/40 mt-1"
        style={{ fontFamily: "var(--font-sans)" }}
      >
        {twist.description}
      </p>
    </div>
  );
}

export function WorldCupFullBracket({
  bracket,
  cupId,
  twists,
}: {
  bracket: GroupStageBracket;
  cupId: AssetClassId;
  twists?: MarketTwist[];
}) {
  const c = cupColors[cupId];

  // Find twists for specific rounds
  const qfTwist = twists?.find((t) => t.round === "quarterfinal");
  const sfTwist = twists?.find((t) => t.round === "semifinal");

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div
          className="flex h-9 w-9 items-center justify-center text-lg font-bold"
          style={{
            borderRadius: "2px",
            background: `${c.accent}18`,
            border: `2px solid ${c.accent}60`,
            color: c.accent,
            fontFamily: "var(--font-display)",
          }}
        >
          {c.icon}
        </div>
        <div>
          <p
            className="text-[10px] tracking-wider text-white/40 font-bold"
            style={{
              fontFamily: "var(--font-display)",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
            }}
          >
            KNOCKOUT BRACKET
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
      </div>

      {/* Twist banners */}
      {(qfTwist || sfTwist) && (
        <div className="grid gap-3 sm:grid-cols-2">
          {qfTwist && <TwistBanner twist={qfTwist} />}
          {sfTwist && <TwistBanner twist={sfTwist} />}
        </div>
      )}

      {/* Bracket layout — horizontal scroll on mobile */}
      <div className="overflow-x-auto pb-4">
        <div className="flex items-start gap-0 w-full">
          {/* R16 */}
          <BracketRoundColumn
            label="Round of 16"
            matches={bracket.roundOf16}
            cellMultiple={1}
            accent={c.accent}
          />

          <BracketConnector inputCount={8} accent={c.accent} />

          {/* QF */}
          <BracketRoundColumn
            label="Quarter-Finals"
            matches={bracket.quarterFinals}
            cellMultiple={2}
            accent={c.accent}
          />

          <BracketConnector inputCount={4} accent={c.accent} />

          {/* SF */}
          <BracketRoundColumn
            label="Semi-Finals"
            matches={bracket.semiFinals}
            cellMultiple={4}
            accent={c.accent}
          />

          <BracketConnector inputCount={2} accent={c.accent} />

          {/* Final */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <p
              className="text-center text-[10px] tracking-wider text-white/30 mb-1.5 font-bold"
              style={{
                fontFamily: "var(--font-display)",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
              }}
            >
              GRAND FINAL
            </p>
            <div
              style={{
                height: 8 * CELL_H,
                display: "flex",
                flexDirection: "column",
                alignItems: "stretch",
                justifyContent: "center",
                padding: "0 4px",
                gap: 12,
              }}
            >
              <div
                className="border p-4"
                style={{
                  borderRadius: "4px",
                  background: `${c.accent}08`,
                  borderColor: `${c.accent}30`,
                  borderTop: `4px solid ${c.accent}`,
                  boxShadow: `0 0 60px ${c.accent}25, 0 0 120px ${c.accent}10`,
                }}
              >
                <KnockoutMatchBlock match={bracket.final} accent={c.accent} />
                {bracket.final.winner && (
                  <div
                    className="mt-3 border p-3 text-center"
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
                      {bracket.final.winner.trader.alias}
                    </p>
                    <p
                      className="mt-1 font-bold"
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: "1.25rem",
                        color: c.accent,
                      }}
                    >
                      {bracket.final.winner.score.toFixed(1)} pts
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Third place + Redemption */}
      <div className="grid gap-4 sm:grid-cols-2">
        {bracket.thirdPlace && (
          <div
            className="border p-4"
            style={{
              borderRadius: "4px",
              borderColor: `${c.accent}30`,
              background: "rgba(255,255,255,0.02)",
            }}
          >
            <p
              className="text-xs font-bold mb-3"
              style={{
                fontFamily: "var(--font-display)",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                color: "rgba(255,255,255,0.60)",
              }}
            >
              THIRD-PLACE MATCH
            </p>
            <KnockoutMatchBlock match={bracket.thirdPlace} accent={c.accent} />
          </div>
        )}

        {(bracket.redemptionBracket.round1.length > 0 ||
          bracket.redemptionBracket.round2.length > 0) && (
          <div
            className="border p-4"
            style={{
              borderRadius: "4px",
              borderColor: "rgba(191,255,0,0.15)",
              background: "rgba(191,255,0,0.03)",
            }}
          >
            <p
              className="text-xs font-bold mb-3"
              style={{
                fontFamily: "var(--font-display)",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                color: "#BFFF00",
              }}
            >
              REDEMPTION BRACKET
            </p>
            <div className="space-y-2">
              {bracket.redemptionBracket.round1.length > 0 && (
                <p className="text-[10px] uppercase tracking-wider text-white/38 mt-1">
                  Round 1
                </p>
              )}
              {bracket.redemptionBracket.round1.map((match) => (
                <KnockoutMatchBlock
                  key={match.id}
                  match={match}
                  accent="#BFFF00"
                />
              ))}
              {bracket.redemptionBracket.round2.length > 0 && (
                <p className="text-[10px] uppercase tracking-wider text-white/38 mt-2">
                  Round 2
                </p>
              )}
              {bracket.redemptionBracket.round2.map((match) => (
                <KnockoutMatchBlock
                  key={match.id}
                  match={match}
                  accent="#BFFF00"
                />
              ))}
              {bracket.redemptionBracket.redemptionFinal && (
                <>
                  <p className="text-[10px] uppercase tracking-wider text-white/38 mt-2">
                    Redemption Final
                  </p>
                  <KnockoutMatchBlock
                    match={bracket.redemptionBracket.redemptionFinal}
                    accent="#BFFF00"
                  />
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
