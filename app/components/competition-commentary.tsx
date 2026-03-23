"use client";

import { useCallback, useState } from "react";
import type {
  CommentaryFeed,
  CrowdFavorite,
  PropGoldenTrade,
  PropNarrativeBeat,
  PropNarrativeSeverity,
} from "@/lib/competition/types";

// ── Props ────────────────────────────────────────────────────────────────────

interface CommentarySectionProps {
  feed: CommentaryFeed;
  voterWallet?: string | null;
}

// ── Severity Colors ──────────────────────────────────────────────────────────

const SEVERITY_STYLES: Record<
  PropNarrativeSeverity,
  { bg: string; border: string; accent: string; label: string }
> = {
  legendary: {
    bg: "rgba(191,255,0,0.04)",
    border: "rgba(191,255,0,0.18)",
    accent: "#BFFF00",
    label: "LEGENDARY",
  },
  hype: {
    bg: "rgba(0,240,255,0.04)",
    border: "rgba(0,240,255,0.18)",
    accent: "#00F0FF",
    label: "HYPE",
  },
  normal: {
    bg: "rgba(255,255,255,0.02)",
    border: "rgba(255,255,255,0.06)",
    accent: "#94a3b8",
    label: "",
  },
};

// ── Narrative Beat Card ──────────────────────────────────────────────────────

function NarrativeBeatCard({ beat }: { beat: PropNarrativeBeat }) {
  const style = SEVERITY_STYLES[beat.severity];
  const timeAgo = formatTimeAgo(beat.timestamp);

  return (
    <div
      className="border p-4 transition"
      style={{
        background: style.bg,
        borderColor: style.border,
        borderRadius: "4px",
        borderLeft: `3px solid ${style.accent}`,
      }}
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex items-center gap-2">
          <span
            className="flex-shrink-0"
            style={{
              width: "6px",
              height: "6px",
              background: style.accent,
              borderRadius: "0px",
            }}
          />
          {style.label && (
            <span
              className="text-[9px] font-bold tracking-wider"
              style={{ color: style.accent, fontFamily: "var(--font-display)" }}
            >
              {style.label}
            </span>
          )}
        </div>
        <span
          className="text-[10px] text-white/30 flex-shrink-0"
          style={{ fontFamily: "var(--font-mono)" }}
        >
          {timeAgo}
        </span>
      </div>
      <p
        className="text-sm font-semibold text-white leading-snug"
        style={{ fontFamily: "var(--font-sans)" }}
      >
        {beat.headline}
      </p>
      <p
        className="text-xs text-white/50 mt-1 leading-relaxed"
        style={{ fontFamily: "var(--font-sans)" }}
      >
        {beat.subtext}
      </p>
    </div>
  );
}

// ── Golden Trade Card ────────────────────────────────────────────────────────

function GoldenTradeCard({ trade }: { trade: PropGoldenTrade }) {
  return (
    <div
      className="border p-5"
      style={{
        background:
          "linear-gradient(135deg, rgba(0,240,255,0.06), rgba(0,240,255,0.02))",
        borderColor: "rgba(0,240,255,0.25)",
        borderRadius: "4px",
      }}
    >
      <div className="flex items-center gap-2 mb-3">
        <span
          style={{
            width: "6px",
            height: "6px",
            background: "#00F0FF",
            borderRadius: "0px",
          }}
        />
        <span
          className="text-xs font-bold tracking-wider"
          style={{
            color: "#00F0FF",
            fontFamily: "var(--font-display)",
            textTransform: "uppercase" as const,
          }}
        >
          GOLDEN TRADE
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <p
            className="text-sm text-white/50"
            style={{
              fontFamily: "var(--font-display)",
              textTransform: "uppercase" as const,
              letterSpacing: "0.05em",
            }}
          >
            Trader
          </p>
          <p
            className="text-lg font-bold text-white"
            style={{ fontFamily: "var(--font-sans)" }}
          >
            {trade.displayName}
          </p>
        </div>
        <div>
          <p
            className="text-sm text-white/50"
            style={{
              fontFamily: "var(--font-display)",
              textTransform: "uppercase" as const,
              letterSpacing: "0.05em",
            }}
          >
            Market
          </p>
          <p
            className="text-lg font-bold text-white"
            style={{ fontFamily: "var(--font-sans)" }}
          >
            {trade.leverage}x {trade.direction.toUpperCase()} {trade.market}
          </p>
        </div>
        <div>
          <p
            className="text-sm text-white/50"
            style={{
              fontFamily: "var(--font-display)",
              textTransform: "uppercase" as const,
              letterSpacing: "0.05em",
            }}
          >
            P&L
          </p>
          <p
            className="text-xl font-bold"
            style={{ color: "#00FF87", fontFamily: "var(--font-mono)" }}
          >
            ${trade.pnlUsd.toLocaleString()} (+{trade.pnlPercent.toFixed(1)}%)
          </p>
        </div>
        <div>
          <p
            className="text-sm text-white/50"
            style={{
              fontFamily: "var(--font-display)",
              textTransform: "uppercase" as const,
              letterSpacing: "0.05em",
            }}
          >
            Context
          </p>
          <p
            className="text-xs text-white/60"
            style={{ fontFamily: "var(--font-sans)" }}
          >
            {trade.cohortContext}
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Crowd Favorites ──────────────────────────────────────────────────────────

function CrowdFavoritesSection({
  favorites,
  voterWallet,
}: {
  favorites: CrowdFavorite[];
  voterWallet?: string | null;
}) {
  const [votedMatches, setVotedMatches] = useState<Set<string>>(new Set());
  const [voteCounts, setVoteCounts] = useState<Record<string, number>>({});

  const castVote = useCallback(
    async (matchId: string, votedFor: string) => {
      if (!voterWallet || votedMatches.has(matchId)) return;
      try {
        const res = await fetch("/api/world-cup/vote", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ matchId, voterWallet, votedFor }),
        });
        if (!res.ok) return;
        const data = await res.json();
        setVotedMatches((prev) => new Set(prev).add(matchId));
        setVoteCounts((prev) => ({ ...prev, [matchId]: data.totalVotes }));
      } catch {
        // Network error — silent
      }
    },
    [voterWallet, votedMatches]
  );

  if (favorites.length === 0) return null;

  return (
    <div
      className="border border-white/6 bg-white/[0.02] p-4"
      style={{ borderRadius: "4px" }}
    >
      <p
        className="text-xs font-bold uppercase tracking-wider text-white/50 mb-3"
        style={{ fontFamily: "var(--font-display)", letterSpacing: "0.1em" }}
      >
        Crowd Favorites
      </p>
      <div className="space-y-2">
        {favorites.slice(0, 5).map((fav) => {
          const displayVotes = voteCounts[fav.matchId] ?? fav.totalVotes;
          const hasVoted = votedMatches.has(fav.matchId);

          return (
            <div
              key={fav.matchId}
              className="flex items-center justify-between text-sm"
            >
              <span
                className="text-white/60"
                style={{ fontFamily: "var(--font-sans)" }}
              >
                {fav.matchId.slice(0, 20)}...
              </span>
              <div className="flex items-center gap-2">
                <span
                  className="text-white/80"
                  style={{ fontFamily: "var(--font-mono)" }}
                >
                  {displayVotes} votes
                </span>
                {voterWallet && !hasVoted ? (
                  <button
                    type="button"
                    onClick={() => castVote(fav.matchId, fav.leadingTrader)}
                    className="px-2 py-0.5 text-[9px] font-bold border transition hover:bg-white/10"
                    style={{
                      borderRadius: "2px",
                      background: "rgba(0,240,255,0.08)",
                      color: "#00F0FF",
                      borderColor: "rgba(0,240,255,0.25)",
                      fontFamily: "var(--font-display)",
                      cursor: "pointer",
                    }}
                  >
                    VOTE
                  </button>
                ) : hasVoted ? (
                  <span
                    className="px-2 py-0.5 text-[9px] font-bold border"
                    style={{
                      borderRadius: "2px",
                      background: "rgba(0,240,255,0.15)",
                      color: "#00F0FF",
                      borderColor: "rgba(0,240,255,0.3)",
                      fontFamily: "var(--font-display)",
                    }}
                  >
                    VOTED
                  </span>
                ) : null}
                {fav.isFeatured && (
                  <span
                    className="px-1.5 py-0.5 text-[9px] font-bold border"
                    style={{
                      borderRadius: "2px",
                      background: "rgba(0,240,255,0.1)",
                      color: "#00F0FF",
                      borderColor: "rgba(0,240,255,0.2)",
                      fontFamily: "var(--font-display)",
                    }}
                  >
                    FEATURED
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────

export function CompetitionCommentary({
  feed,
  voterWallet,
}: CommentarySectionProps) {
  return (
    <div className="space-y-6">
      {/* Golden Trade */}
      {feed.goldenTrade && <GoldenTradeCard trade={feed.goldenTrade} />}

      {/* Narrative Feed */}
      <div>
        <p
          className="text-xs font-bold uppercase tracking-wider text-white/50 mb-3"
          style={{ fontFamily: "var(--font-display)", letterSpacing: "0.1em" }}
        >
          Live Commentary
        </p>
        <div className="space-y-3">
          {feed.beats.slice(0, 8).map((beat, idx) => (
            <NarrativeBeatCard key={`${beat.type}-${idx}`} beat={beat} />
          ))}
        </div>
      </div>

      {/* Crowd Favorites */}
      <CrowdFavoritesSection
        favorites={feed.crowdFavorites}
        voterWallet={voterWallet}
      />

      {/* Rivalries */}
      {feed.rivalries.length > 0 && (
        <div
          className="border border-white/6 bg-white/[0.02] p-4"
          style={{ borderRadius: "4px" }}
        >
          <p
            className="text-xs font-bold uppercase tracking-wider text-white/50 mb-3"
            style={{
              fontFamily: "var(--font-display)",
              letterSpacing: "0.1em",
            }}
          >
            Active Rivalries
          </p>
          <div className="space-y-2">
            {feed.rivalries.slice(0, 5).map((rivalry, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between text-sm"
              >
                <div>
                  <span
                    className="text-white/80"
                    style={{ fontFamily: "var(--font-mono)" }}
                  >
                    {rivalry.walletA.slice(0, 10)}...
                  </span>
                  <span
                    className="text-white/30 mx-2"
                    style={{ fontFamily: "var(--font-display)" }}
                  >
                    VS
                  </span>
                  <span
                    className="text-white/80"
                    style={{ fontFamily: "var(--font-mono)" }}
                  >
                    {rivalry.walletB.slice(0, 10)}...
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className="text-xs text-white/50"
                    style={{ fontFamily: "var(--font-mono)" }}
                  >
                    {rivalry.meetings} meetings ({rivalry.aWins}-{rivalry.bWins}
                    -{rivalry.draws})
                  </span>
                  <span
                    className="px-1.5 py-0.5 text-[9px] font-bold border"
                    style={{
                      borderRadius: "2px",
                      background: "rgba(191,90,242,0.1)",
                      color: "#BF5AF2",
                      borderColor: "rgba(191,90,242,0.2)",
                      fontFamily: "var(--font-display)",
                    }}
                  >
                    {rivalry.narrativeTag}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}
