"use client";

export const dynamic = "force-dynamic";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSafePrivy } from "@/app/hooks/use-safe-privy";

// ── Badge definitions (config — keep as constant) ───────────────────────────

const ALL_BADGES = [
  {
    id: "scout_complete",
    label: "Scout Complete",
    icon: "🔵",
    earnHow: "Pass a Scout challenge",
  },
  {
    id: "ranger_complete",
    label: "Ranger Complete",
    icon: "🟢",
    earnHow: "Pass a Ranger challenge",
  },
  {
    id: "veteran_complete",
    label: "Veteran Complete",
    icon: "🟣",
    earnHow: "Pass a Veteran challenge",
  },
  {
    id: "elite_complete",
    label: "Elite Complete",
    icon: "🟡",
    earnHow: "Pass an Elite challenge",
  },
  {
    id: "apex_complete",
    label: "Apex Complete",
    icon: "🔴",
    earnHow: "Pass an Apex challenge",
  },
  {
    id: "funded_trader",
    label: "Funded Trader",
    icon: "🏆",
    earnHow: "Pass Elite or Apex",
  },
  {
    id: "forex_specialist",
    label: "Forex Specialist",
    icon: "💱",
    earnHow: "Pass Forex Specialist challenge",
  },
  {
    id: "commodities_specialist",
    label: "Commodities Specialist",
    icon: "🥇",
    earnHow: "Pass Commodities Specialist",
  },
  {
    id: "crypto_specialist",
    label: "Crypto Specialist",
    icon: "⚡",
    earnHow: "Pass Crypto Specialist",
  },
  {
    id: "multi_asset_master",
    label: "Multi-Asset Master",
    icon: "🌐",
    earnHow: "Pass Multi-Asset Specialist",
  },
  {
    id: "unbreakable",
    label: "Unbreakable",
    icon: "💎",
    earnHow: "10-day trading streak",
  },
  {
    id: "world_cup_champion",
    label: "World Cup Champion",
    icon: "🌍",
    earnHow: "Win a World Cup division",
  },
  {
    id: "grand_champion",
    label: "Grand Champion",
    icon: "👑",
    earnHow: "Win the Grand Championship",
  },
  {
    id: "comeback",
    label: "Comeback King",
    icon: "⚔️",
    earnHow: "Win the Redemption Bracket",
  },
] as const;

// ── Types for API response ──────────────────────────────────────────────────

interface ProfilePerformance {
  pnlPercent: number;
  winRate: number;
  consistencyScore: number;
  maxDrawdownPercent: number;
  volumeUsd: number;
}

interface ChallengeRow {
  tier: string;
  date: string;
  result: "Passed" | "Failed";
  finalRank: number;
  finalScore: number;
  payoutUsd: number | null;
}

interface RankEntry {
  label: string;
  rank: number;
  score: number;
  cohortId: string;
}

interface WorldCupRecord {
  matchesPlayed: number;
  wins: number;
  losses: number;
  bestRound: string;
}

interface ProfileData {
  found: true;
  wallet: string;
  walletShort: string;
  overallScore: number;
  seasonRank: number | null;
  streakDays: number;
  fundedStatus: string | null;
  performance: ProfilePerformance | null;
  earnedBadgeIds: string[];
  challengeHistory: ChallengeRow[];
  rankHistory: RankEntry[];
  worldCup: WorldCupRecord | null;
  enrollmentCount: number;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Map rank 1-8 to a bar height percentage (rank 1 = 100%, rank 8 = 12%). */
function rankToHeight(rank: number): number {
  const maxRank = 8;
  const minHeight = 12;
  if (rank <= 0) return 100;
  return Math.round(
    minHeight +
      ((maxRank - Math.min(rank, maxRank)) / (maxRank - 1)) * (100 - minHeight)
  );
}

/** Return initials for a display name (up to 2 chars). */
function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

// ── Page component ──────────────────────────────────────────────────────────

export default function ProfilePage() {
  const { user, ready, authenticated } = useSafePrivy();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(false);
  const [notFound, setNotFound] = useState(false);

  // Extract wallet address from Privy user
  const wallet = user?.wallet?.address ?? null;
  const walletShort = wallet
    ? wallet.slice(0, 4) + "..." + wallet.slice(-4)
    : null;

  useEffect(() => {
    if (!wallet) {
      requestAnimationFrame(() => {
        setProfile(null);
        setNotFound(false);
      });
      return;
    }

    let cancelled = false;
    requestAnimationFrame(() => {
      setLoading(true);
      setNotFound(false);
    });

    fetch(`/api/profile?wallet=${encodeURIComponent(wallet)}`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        if (data.found) {
          setProfile(data as ProfileData);
          setNotFound(false);
        } else {
          setProfile(null);
          setNotFound(true);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setProfile(null);
          setNotFound(true);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [wallet]);

  // ── Connect wallet state ──────────────────────────────────────────────────

  if (!ready) {
    return (
      <div className="competition-shell">
        <div className="mx-auto max-w-5xl px-4 py-10 space-y-8">
          <div style={{ textAlign: "center", padding: "4rem 0" }}>
            <div
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "1rem",
                color: "var(--text-tertiary)",
              }}
            >
              Loading...
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!authenticated || !wallet) {
    return (
      <div className="competition-shell">
        <div className="mx-auto max-w-5xl px-4 py-10 space-y-8">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm"
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase" as const,
              color: "#00F0FF",
            }}
          >
            &larr; Arena Hub
          </Link>
          <div
            className="hero-panel"
            style={{ textAlign: "center", padding: "4rem 2rem" }}
          >
            <h1
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "1.6rem",
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                color: "#F0F0F0",
                marginBottom: "1rem",
              }}
            >
              Connect Your Wallet
            </h1>
            <p
              style={{
                fontSize: "0.9rem",
                color: "var(--text-secondary)",
                maxWidth: "28rem",
                margin: "0 auto",
              }}
            >
              Connect your wallet to view your profile, challenge history,
              badges, and performance stats.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── Loading state ─────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="competition-shell">
        <div className="mx-auto max-w-5xl px-4 py-10 space-y-8">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm"
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase" as const,
              color: "#00F0FF",
            }}
          >
            &larr; Arena Hub
          </Link>
          <div style={{ textAlign: "center", padding: "4rem 0" }}>
            <div
              style={{
                width: "2.5rem",
                height: "2.5rem",
                border: "3px solid rgba(0,240,255,0.2)",
                borderTop: "3px solid #00F0FF",
                borderRadius: "50%",
                animation: "spin 0.8s linear infinite",
                margin: "0 auto 1rem",
              }}
            />
            <div
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "0.85rem",
                color: "var(--text-tertiary)",
                textTransform: "uppercase",
                letterSpacing: "0.1em",
              }}
            >
              Loading Profile...
            </div>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        </div>
      </div>
    );
  }

  // ── No data state ─────────────────────────────────────────────────────────

  if (notFound || !profile) {
    return (
      <div className="competition-shell">
        <div className="mx-auto max-w-5xl px-4 py-10 space-y-8">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm"
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase" as const,
              color: "#00F0FF",
            }}
          >
            &larr; Arena Hub
          </Link>
          <div
            className="hero-panel"
            style={{ textAlign: "center", padding: "4rem 2rem" }}
          >
            <h1
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "1.6rem",
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                color: "#F0F0F0",
                marginBottom: "0.5rem",
              }}
            >
              No Competition Data Yet
            </h1>
            <p
              style={{
                fontSize: "0.8rem",
                color: "var(--text-tertiary)",
                fontFamily: "var(--font-mono)",
              }}
            >
              {walletShort}
            </p>
            <p
              style={{
                fontSize: "0.9rem",
                color: "var(--text-secondary)",
                maxWidth: "28rem",
                margin: "1rem auto 0",
              }}
            >
              You haven&apos;t participated in any challenges yet. Enroll in a
              competition to start building your profile.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── Main profile view ─────────────────────────────────────────────────────

  const earned = new Set<string>(profile.earnedBadgeIds);
  const displayName = profile.walletShort;

  return (
    <div className="competition-shell">
      <div className="mx-auto max-w-5xl px-4 py-10 space-y-8">
        {/* ── Back link ── */}
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm"
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: 700,
            letterSpacing: "0.08em",
            textTransform: "uppercase" as const,
            color: "#00F0FF",
          }}
        >
          &larr; Arena Hub
        </Link>

        {/* ── PROFILE HEADER ─────────────────────────────────────────────────── */}
        <div
          className="hero-panel glow-gold"
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "1.75rem",
            alignItems: "center",
          }}
        >
          {/* Hex avatar */}
          <div
            style={{
              flexShrink: 0,
              width: "5.5rem",
              height: "5.5rem",
              clipPath:
                "polygon(50% 0%, 93% 25%, 93% 75%, 50% 100%, 7% 75%, 7% 25%)",
              background: "linear-gradient(135deg, #00F0FF, #00C8D9)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <span
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "1.6rem",
                fontWeight: 800,
                color: "#050505",
                letterSpacing: "0.04em",
              }}
            >
              {initials(displayName)}
            </span>
          </div>

          {/* Name + meta */}
          <div style={{ flex: 1, minWidth: "12rem" }}>
            <p className="eyebrow">Trader Profile</p>
            <h1
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "clamp(2rem, 5vw, 3.2rem)",
                fontWeight: 700,
                letterSpacing: "0.05em",
                textTransform: "uppercase",
                lineHeight: 1,
                color: "#F0F0F0",
                marginBottom: "0.5rem",
              }}
            >
              {displayName}
            </h1>

            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                gap: "0.6rem",
                marginBottom: "0.75rem",
              }}
            >
              <code
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "0.8rem",
                  color: "var(--text-secondary)",
                  background: "rgba(5,5,5,0.5)",
                  borderRadius: "2px",
                  padding: "0.2rem 0.6rem",
                  border: "1px solid var(--border-default)",
                }}
              >
                {profile.walletShort}
              </code>
              {profile.fundedStatus && (
                <span className="badge-funded">Funded</span>
              )}
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: "1.5rem" }}>
              {profile.seasonRank != null && (
                <div>
                  <span
                    style={{
                      fontFamily: "var(--font-display)",
                      fontSize: "0.72rem",
                      textTransform: "uppercase",
                      letterSpacing: "0.16em",
                      color: "var(--text-tertiary)",
                    }}
                  >
                    Season Rank
                  </span>
                  <div
                    style={{
                      fontFamily: "var(--font-display)",
                      fontSize: "1.6rem",
                      fontWeight: 700,
                      color: "#00F0FF",
                      lineHeight: 1.1,
                    }}
                  >
                    #{profile.seasonRank}
                  </div>
                </div>
              )}
              <div>
                <span
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: "0.72rem",
                    textTransform: "uppercase",
                    letterSpacing: "0.16em",
                    color: "var(--text-tertiary)",
                  }}
                >
                  Overall Score
                </span>
                <div
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "1.6rem",
                    fontWeight: 700,
                    color: "#F0F0F0",
                    lineHeight: 1.1,
                  }}
                >
                  {profile.overallScore.toLocaleString()}
                </div>
              </div>
              <div>
                <span
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: "0.72rem",
                    textTransform: "uppercase",
                    letterSpacing: "0.16em",
                    color: "var(--text-tertiary)",
                  }}
                >
                  Streak
                </span>
                <div
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: "1.6rem",
                    fontWeight: 700,
                    color: "#00FF87",
                    lineHeight: 1.1,
                  }}
                >
                  {profile.streakDays}D
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── SEASON STATS GRID ──────────────────────────────────────────────── */}
        {profile.performance && (
          <section>
            <p className="eyebrow">Season Performance</p>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(11rem, 1fr))",
                gap: "1rem",
              }}
            >
              <div className="stat-card">
                <span>Total P&amp;L</span>
                <strong
                  className={
                    profile.performance.pnlPercent >= 0
                      ? "value-positive"
                      : "value-negative"
                  }
                >
                  {profile.performance.pnlPercent >= 0 ? "+" : ""}
                  {profile.performance.pnlPercent.toFixed(1)}%
                </strong>
              </div>
              <div className="stat-card">
                <span>Win Rate</span>
                <strong className="value-positive">
                  {(profile.performance.winRate * 100).toFixed(0)}%
                </strong>
              </div>
              <div className="stat-card">
                <span>Consistency</span>
                <strong
                  style={{
                    display: "block",
                    marginTop: "0.5rem",
                    fontFamily: "var(--font-mono)",
                    fontSize: "1.4rem",
                    fontWeight: 700,
                    color: "#00F0FF",
                  }}
                >
                  {profile.performance.consistencyScore.toFixed(0)}
                </strong>
              </div>
              <div className="stat-card">
                <span>Max Drawdown</span>
                <strong className="value-positive">
                  {profile.performance.maxDrawdownPercent.toFixed(1)}%
                </strong>
              </div>
            </div>
          </section>
        )}

        {/* ── ACHIEVEMENT WALL ───────────────────────────────────────────────── */}
        <section className="panel">
          <p className="eyebrow">Achievement Wall</p>
          <h2
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "1.15rem",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              marginBottom: "1.25rem",
            }}
          >
            Badges &amp; Titles
            <span
              style={{
                marginLeft: "0.75rem",
                fontSize: "0.78rem",
                color: "var(--text-tertiary)",
                fontWeight: 400,
              }}
            >
              {profile.earnedBadgeIds.length}/{ALL_BADGES.length} earned
            </span>
          </h2>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, 1fr)",
              gap: "0.75rem",
            }}
          >
            {ALL_BADGES.map((badge) => {
              const isEarned = earned.has(badge.id);
              return (
                <div
                  key={badge.id}
                  title={isEarned ? `${badge.label} -- Earned` : badge.earnHow}
                  style={{
                    position: "relative",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: "0.4rem",
                    padding: "0.85rem 0.5rem",
                    borderRadius: "4px",
                    border: `1px solid ${isEarned ? "rgba(0,240,255,0.35)" : "var(--border-subtle)"}`,
                    background: isEarned
                      ? "rgba(0,240,255,0.06)"
                      : "rgba(255,255,255,0.025)",
                    boxShadow: isEarned
                      ? "0 0 16px rgba(0,240,255,0.18), 0 0 0 1px rgba(0,240,255,0.2)"
                      : "none",
                    filter: isEarned ? "none" : "grayscale(0.85) opacity(0.38)",
                    transition: "transform 160ms ease",
                    cursor: "default",
                  }}
                >
                  <span style={{ fontSize: "1.75rem", lineHeight: 1 }}>
                    {badge.icon}
                  </span>
                  <span
                    style={{
                      fontFamily: "var(--font-display)",
                      fontSize: "0.65rem",
                      fontWeight: 700,
                      textAlign: "center",
                      lineHeight: 1.3,
                      color: isEarned ? "#00F0FF" : "var(--text-tertiary)",
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                    }}
                  >
                    {badge.label}
                  </span>
                  {isEarned && (
                    <span
                      style={{
                        fontFamily: "var(--font-display)",
                        fontSize: "0.55rem",
                        fontWeight: 800,
                        letterSpacing: "0.14em",
                        textTransform: "uppercase",
                        color: "#00FF87",
                      }}
                    >
                      EARNED
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* ── CHALLENGE HISTORY ──────────────────────────────────────────────── */}
        {profile.challengeHistory.length > 0 && (
          <section className="panel">
            <p className="eyebrow">Challenge History</p>
            <h2
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "1.15rem",
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                marginBottom: "1.25rem",
              }}
            >
              Past Attempts
            </h2>

            <div style={{ overflowX: "auto" }}>
              <table className="leaderboard-table">
                <thead>
                  <tr>
                    <th>Tier</th>
                    <th>Date</th>
                    <th>Result</th>
                    <th style={{ textAlign: "right" }}>Rank</th>
                    <th style={{ textAlign: "right" }}>Score</th>
                    <th style={{ textAlign: "right" }}>Payout</th>
                  </tr>
                </thead>
                <tbody>
                  {profile.challengeHistory.map((row, i) => {
                    const passed = row.result === "Passed";
                    return (
                      <tr
                        key={i}
                        style={
                          passed ? { background: "rgba(0,255,135,0.03)" } : {}
                        }
                      >
                        <td>
                          <span
                            style={{
                              fontFamily: "var(--font-display)",
                              fontWeight: 700,
                              fontSize: "0.85rem",
                              textTransform: "uppercase",
                              color: "var(--text-primary)",
                            }}
                          >
                            {row.tier}
                          </span>
                        </td>
                        <td>
                          <span
                            style={{
                              fontFamily: "var(--font-mono)",
                              fontSize: "0.8rem",
                              color: "var(--text-secondary)",
                            }}
                          >
                            {row.date}
                          </span>
                        </td>
                        <td>
                          <span
                            className={
                              passed ? "status-okay" : "status-flagged"
                            }
                          >
                            {row.result}
                          </span>
                        </td>
                        <td style={{ textAlign: "right" }}>
                          <span
                            style={{
                              fontFamily: "var(--font-mono)",
                              fontVariantNumeric: "tabular-nums",
                              color: "var(--text-secondary)",
                            }}
                          >
                            #{row.finalRank}
                          </span>
                        </td>
                        <td style={{ textAlign: "right" }}>
                          <span
                            style={{
                              fontFamily: "var(--font-mono)",
                              fontVariantNumeric: "tabular-nums",
                            }}
                          >
                            {row.finalScore.toFixed(0)}
                          </span>
                        </td>
                        <td style={{ textAlign: "right" }}>
                          {row.payoutUsd != null ? (
                            <span
                              className="value-positive"
                              style={{
                                fontFamily: "var(--font-mono)",
                                fontWeight: 700,
                              }}
                            >
                              ${row.payoutUsd.toLocaleString()}
                            </span>
                          ) : (
                            <span
                              style={{
                                color: "var(--text-tertiary)",
                                fontSize: "0.8rem",
                              }}
                            >
                              &mdash;
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* ── RANK PROGRESSION ───────────────────────────────────────────────── */}
        {profile.rankHistory.length > 0 && (
          <section className="panel">
            <p className="eyebrow">Rank Progression</p>
            <h2
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "1.15rem",
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                marginBottom: "1.5rem",
              }}
            >
              Recent Cohorts
            </h2>

            <div
              style={{
                display: "flex",
                alignItems: "flex-end",
                gap: "0.75rem",
                height: "9rem",
                padding: "0 0.25rem",
              }}
            >
              {profile.rankHistory.map((w, idx) => {
                const heightPct = w.rank > 0 ? rankToHeight(w.rank) : 50;
                const isLatest = idx === profile.rankHistory.length - 1;
                return (
                  <div
                    key={w.label}
                    style={{
                      flex: 1,
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: "0.5rem",
                      height: "100%",
                      justifyContent: "flex-end",
                    }}
                  >
                    {/* Rank label above bar */}
                    <span
                      style={{
                        fontFamily: "var(--font-display)",
                        fontSize: "0.7rem",
                        fontWeight: 700,
                        color: isLatest ? "#00F0FF" : "var(--text-secondary)",
                      }}
                    >
                      {w.rank > 0 ? `#${w.rank}` : "--"}
                    </span>

                    {/* Bar */}
                    <div
                      style={{
                        width: "100%",
                        height: `${heightPct}%`,
                        borderRadius: "2px 2px 0 0",
                        background: isLatest
                          ? "linear-gradient(180deg, #00F0FF, #00C8D9)"
                          : "rgba(0,240,255,0.2)",
                        boxShadow: isLatest
                          ? "0 0 16px rgba(0,240,255,0.35)"
                          : "none",
                        transition: "height 400ms ease",
                      }}
                    />

                    {/* Week label below bar */}
                    <span
                      style={{
                        fontFamily: "var(--font-display)",
                        fontSize: "0.7rem",
                        fontWeight: 600,
                        color: "var(--text-tertiary)",
                        letterSpacing: "0.06em",
                      }}
                    >
                      {w.label}
                    </span>
                  </div>
                );
              })}
            </div>

            <p
              style={{
                marginTop: "1rem",
                fontSize: "0.76rem",
                color: "var(--text-tertiary)",
              }}
            >
              Rank trajectory over recent cohorts. Bar height indicates relative
              standing -- taller = higher rank.
            </p>
          </section>
        )}

        {/* ── WORLD CUP RECORD ───────────────────────────────────────────────── */}
        {profile.worldCup && (
          <section className="funded-card glow-gold">
            <p className="eyebrow">World Cup Record</p>
            <h2
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "1.15rem",
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                marginBottom: "1.25rem",
              }}
            >
              Tournament History
            </h2>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(10rem, 1fr))",
                gap: "1rem",
              }}
            >
              <div className="stat-card">
                <span>Matches Played</span>
                <strong
                  style={{
                    display: "block",
                    marginTop: "0.5rem",
                    fontFamily: "var(--font-mono)",
                    fontSize: "1.4rem",
                    fontWeight: 700,
                    color: "#00F0FF",
                  }}
                >
                  {profile.worldCup.matchesPlayed}
                </strong>
              </div>
              <div className="stat-card">
                <span>Record</span>
                <strong
                  style={{
                    display: "block",
                    marginTop: "0.5rem",
                    fontFamily: "var(--font-display)",
                    fontSize: "1.4rem",
                    fontWeight: 700,
                    color: "#00F0FF",
                  }}
                >
                  {profile.worldCup.wins}W - {profile.worldCup.losses}L
                </strong>
              </div>
              <div className="stat-card">
                <span>Best Round</span>
                <strong
                  style={{
                    display: "block",
                    marginTop: "0.5rem",
                    fontFamily: "var(--font-display)",
                    fontSize: "1rem",
                    fontWeight: 700,
                    color: "#00F0FF",
                  }}
                >
                  {profile.worldCup.bestRound}
                </strong>
              </div>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
