"use client";

import { useState, useEffect } from "react";
import type {
  CompetitionCohortView,
  FundedStatus,
  HeadToHeadMatch,
  RewardPreview,
  RiskEvent,
} from "@/lib/competition/types";
import Link from "next/link";
import { EquitySparkline } from "./equity-sparkline";

// ── Formatters (duplicated from competition-hub for component self-containment) ──

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatPercent(value: number) {
  return `${value.toFixed(1)}%`;
}

function formatSignedNumber(value: number) {
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface LeaderboardSectionProps {
  selectedCohort: CompetitionCohortView;
  walletAddress: string | null | undefined;
  enrolledCohortId: string | null;
  viewerRewardPreview: RewardPreview | null;
  viewerFundedStatus: FundedStatus;
  matchups?: HeadToHeadMatch[];
  activeRiskEvents?: RiskEvent[];
}

// ── Component ─────────────────────────────────────────────────────────────────

function getMatchupIndicator(
  wallet: string,
  matchups?: HeadToHeadMatch[]
): { label: string; className: string } | null {
  if (!matchups) return null;
  for (const m of matchups) {
    if (m.status !== "completed" || !m.result) continue;
    if (m.traderA !== wallet && m.traderB !== wallet) continue;
    if (m.result.isDraw) return { label: "D", className: "matchup-draw" };
    if (m.result.winnerId === wallet)
      return { label: "W", className: "matchup-win" };
    return { label: "L", className: "matchup-loss" };
  }
  return null;
}

function getActiveRiskBadge(
  rank: number,
  riskEvents?: RiskEvent[]
): RiskEvent | null {
  if (!riskEvents || riskEvents.length === 0) return null;
  for (const event of riskEvents) {
    const tierId =
      rank <= 5
        ? "apex"
        : rank <= 10
          ? "elite"
          : rank <= 15
            ? "veteran"
            : rank <= 20
              ? "ranger"
              : "scout";
    if (event.affectedTiers.includes(tierId as never)) return event;
  }
  return null;
}

export function LeaderboardSection({
  selectedCohort,
  walletAddress,
  enrolledCohortId,
  viewerRewardPreview,
  viewerFundedStatus,
  matchups,
  activeRiskEvents,
}: LeaderboardSectionProps) {
  const hasMutagen = selectedCohort.standings.some(
    (e) => e.mutagenScore != null
  );
  const [scoreMode, setScoreMode] = useState<"tournament" | "mutagen">(
    "tournament"
  );

  // Fetch equity curves for sparklines
  const [equityByWallet, setEquityByWallet] = useState<
    Record<string, number[]>
  >({});
  useEffect(() => {
    const cohortId = selectedCohort.id;
    const wallets = selectedCohort.standings.slice(0, 10).map((e) => e.wallet);
    let cancelled = false;
    Promise.all(
      wallets.map((wallet) =>
        fetch(
          `/api/competition/equity?wallet=${encodeURIComponent(wallet)}&cohortId=${encodeURIComponent(cohortId)}`
        )
          .then((res) => res.json())
          .then((data) => ({ wallet, points: data.points as number[] }))
          .catch(() => ({ wallet, points: [] as number[] }))
      )
    ).then((results) => {
      if (cancelled) return;
      const map: Record<string, number[]> = {};
      for (const r of results) map[r.wallet] = r.points;
      setEquityByWallet(map);
    });
    return () => {
      cancelled = true;
    };
  }, [selectedCohort.id, selectedCohort.standings]);

  // Re-sort by mutagen if in mutagen mode
  const sortedStandings =
    scoreMode === "mutagen" && hasMutagen
      ? [...selectedCohort.standings]
          .sort(
            (a, b) =>
              (b.mutagenScore?.totalMutagen ?? 0) -
              (a.mutagenScore?.totalMutagen ?? 0)
          )
          .map((entry, idx) => ({ ...entry, displayRank: idx + 1 }))
      : selectedCohort.standings.map((entry) => ({
          ...entry,
          displayRank: entry.rank,
        }));

  return (
    <section className="grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
      <div className="panel-elevated">
        <h2
          className="section-title mb-3"
          style={{
            fontFamily: "var(--font-display)",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
          }}
        >
          {selectedCohort.name} Leaderboard
        </h2>

        {/* Live indicator + scoring mode toggle */}
        <div className="mb-4 flex items-center gap-2">
          <span className="flex items-center gap-1.5">
            <span
              className="animate-live-blink"
              style={{
                display: "inline-block",
                width: "6px",
                height: "6px",
                background: "#FF3D3D",
                borderRadius: "1px",
              }}
            />
            <span
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "11px",
                fontWeight: 700,
                color: "#FF3D3D",
                textTransform: "uppercase",
                letterSpacing: "0.1em",
              }}
            >
              LIVE
            </span>
          </span>
          <span
            className="text-xs"
            style={{
              color: "rgba(255,255,255,0.3)",
              fontFamily: "var(--font-mono)",
              fontSize: "10px",
            }}
          >
            Updates every 30s
          </span>

          <a
            href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(
              `Check out the ${selectedCohort.name} leaderboard on @aabornyxyz Prop Challenge! 🏆\n\nhttps://adrena.xyz`
            )}`}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-2 inline-flex items-center gap-1 border border-white/10 px-2 py-1 text-white/50 transition hover:bg-white/[0.08] hover:text-white/80"
            style={{
              borderRadius: "2px",
              background: "rgba(255,255,255,0.04)",
              fontFamily: "var(--font-display)",
              fontSize: "10px",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
            }}
            title="Share leaderboard on X"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-3 w-3 fill-current"
              aria-hidden="true"
            >
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
            </svg>
            Share
          </a>

          {hasMutagen && (
            <div
              className="ml-4 inline-flex items-center border border-white/10"
              style={{
                borderRadius: "2px",
                background: "rgba(255,255,255,0.03)",
              }}
            >
              <button
                type="button"
                className="transition"
                style={{
                  borderRadius: "2px",
                  padding: "4px 10px",
                  fontFamily: "var(--font-display)",
                  fontSize: "10px",
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  background:
                    scoreMode === "tournament"
                      ? "rgba(255,255,255,0.1)"
                      : "transparent",
                  color:
                    scoreMode === "tournament"
                      ? "#fff"
                      : "rgba(255,255,255,0.4)",
                }}
                onClick={() => setScoreMode("tournament")}
              >
                TOURNAMENT
              </button>
              <span
                style={{
                  width: "1px",
                  height: "18px",
                  background: "rgba(255,255,255,0.1)",
                }}
              />
              <button
                type="button"
                className="transition"
                style={{
                  borderRadius: "2px",
                  padding: "4px 10px",
                  fontFamily: "var(--font-display)",
                  fontSize: "10px",
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  background:
                    scoreMode === "mutagen"
                      ? "rgba(0,240,255,0.12)"
                      : "transparent",
                  color:
                    scoreMode === "mutagen"
                      ? "#00F0FF"
                      : "rgba(255,255,255,0.4)",
                }}
                onClick={() => setScoreMode("mutagen")}
              >
                MUTAGEN
              </button>
            </div>
          )}

          <div
            className="ml-auto text-xs"
            style={{
              color: "rgba(255,255,255,0.3)",
              fontFamily: "var(--font-mono)",
              fontSize: "10px",
            }}
          >
            Closes: {formatDate(selectedCohort.endTime)}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="leaderboard-table">
            <thead>
              <tr>
                <th>Rank</th>
                <th>Trader</th>
                <th
                  title={
                    scoreMode === "mutagen"
                      ? "Adrena Mutagen score"
                      : "Tournament score (hover for breakdown)"
                  }
                >
                  {scoreMode === "mutagen" ? "Mutagen" : "Score"} ⓘ
                </th>
                <th>PnL</th>
                <th>Volume</th>
                <th>Win rate</th>
                <th>Trades</th>
                <th>Days</th>
                <th>Equity</th>
                <th>Status</th>
                <th>Share</th>
              </tr>
            </thead>
            <tbody>
              {sortedStandings.map((entry, idx) => {
                const isViewer =
                  walletAddress && entry.wallet === walletAddress;
                const isFunded = entry.eligible && entry.rank <= 5;
                const isWatchlist =
                  entry.eligible && entry.rank > 5 && entry.rank <= 10;
                const rankDelta = 0;
                const matchupResult = getMatchupIndicator(
                  entry.wallet,
                  matchups
                );
                const riskBadge = getActiveRiskBadge(
                  entry.rank,
                  activeRiskEvents
                );

                return (
                  <tr
                    key={entry.wallet}
                    className={isViewer ? "leaderboard-row-active" : ""}
                    style={{
                      transition: "background 0.3s ease",
                      background: isFunded ? "rgba(0,240,255,0.04)" : undefined,
                    }}
                  >
                    <td>
                      <div className="flex items-center gap-1.5">
                        <span
                          style={{
                            fontFamily: "var(--font-display)",
                            fontSize: "1.5rem",
                            fontWeight: 700,
                            lineHeight: 1,
                            color:
                              entry.displayRank <= 3
                                ? "#00F0FF"
                                : "rgba(255,255,255,0.5)",
                          }}
                        >
                          #{entry.displayRank}
                        </span>
                        {rankDelta !== 0 && (
                          <span
                            className={
                              rankDelta > 0
                                ? "rank-delta-up"
                                : "rank-delta-down"
                            }
                          >
                            {rankDelta > 0
                              ? `▲${rankDelta}`
                              : `▼${Math.abs(rankDelta)}`}
                          </span>
                        )}
                      </div>
                    </td>
                    <td>
                      <div className="flex flex-col">
                        <div className="flex items-center gap-1.5">
                          <Link
                            href="/profile"
                            className="font-semibold hover:text-[--accent] transition-colors"
                          >
                            {entry.displayName}
                          </Link>
                          {isFunded && (
                            <span
                              style={{
                                borderRadius: "2px",
                                padding: "1px 6px",
                                fontSize: "9px",
                                fontFamily: "var(--font-display)",
                                fontWeight: 700,
                                letterSpacing: "0.08em",
                                textTransform: "uppercase",
                                background: "rgba(0,240,255,0.15)",
                                color: "#00F0FF",
                              }}
                            >
                              FUNDED
                            </span>
                          )}
                          {isWatchlist && (
                            <span
                              style={{
                                borderRadius: "2px",
                                padding: "1px 6px",
                                fontSize: "9px",
                                fontFamily: "var(--font-display)",
                                fontWeight: 700,
                                letterSpacing: "0.08em",
                                textTransform: "uppercase",
                                background: "rgba(255,255,255,0.08)",
                                color: "rgba(255,255,255,0.5)",
                              }}
                            >
                              WATCH
                            </span>
                          )}
                          {isViewer && (
                            <span
                              style={{
                                borderRadius: "2px",
                                padding: "1px 6px",
                                fontSize: "9px",
                                fontFamily: "var(--font-display)",
                                fontWeight: 700,
                                letterSpacing: "0.08em",
                                textTransform: "uppercase",
                                background: "rgba(0,255,135,0.15)",
                                color: "#00FF87",
                              }}
                            >
                              YOU
                            </span>
                          )}
                          {matchupResult && (
                            <span
                              className="inline-flex items-center justify-center"
                              style={{
                                width: "20px",
                                height: "20px",
                                borderRadius: "2px",
                                fontSize: "10px",
                                fontFamily: "var(--font-display)",
                                fontWeight: 700,
                                background:
                                  matchupResult.label === "W"
                                    ? "rgba(0,255,135,0.15)"
                                    : matchupResult.label === "L"
                                      ? "rgba(255,61,61,0.15)"
                                      : "rgba(255,255,255,0.1)",
                                color:
                                  matchupResult.label === "W"
                                    ? "#00FF87"
                                    : matchupResult.label === "L"
                                      ? "#FF3D3D"
                                      : "rgba(255,255,255,0.6)",
                              }}
                            >
                              {matchupResult.label}
                            </span>
                          )}
                          {riskBadge && (
                            <span
                              className="inline-flex items-center gap-1"
                              style={{
                                borderRadius: "2px",
                                padding: "1px 6px",
                                fontSize: "9px",
                                fontFamily: "var(--font-display)",
                                fontWeight: 700,
                                background:
                                  riskBadge.severity === "severe"
                                    ? "rgba(255,61,61,0.15)"
                                    : riskBadge.severity === "moderate"
                                      ? "rgba(0,240,255,0.12)"
                                      : "rgba(0,240,255,0.08)",
                                color:
                                  riskBadge.severity === "severe"
                                    ? "#FF3D3D"
                                    : riskBadge.severity === "moderate"
                                      ? "#00F0FF"
                                      : "#00F0FF",
                              }}
                              title={riskBadge.description}
                            >
                              <span
                                style={{
                                  display: "inline-block",
                                  width: "5px",
                                  height: "5px",
                                  borderRadius: "1px",
                                  background:
                                    riskBadge.severity === "severe"
                                      ? "#FF3D3D"
                                      : riskBadge.severity === "moderate"
                                        ? "#00F0FF"
                                        : "#00F0FF",
                                }}
                              />
                              {riskBadge.label}
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-white/40">
                          {entry.badge}
                        </span>
                      </div>
                    </td>
                    <td>
                      <div className="group relative">
                        <span style={{ fontFamily: "var(--font-mono)" }}>
                          {scoreMode === "mutagen" && entry.mutagenScore
                            ? entry.mutagenScore.totalMutagen.toFixed(4)
                            : entry.tournamentScore}
                        </span>
                        {/* Score breakdown tooltip */}
                        <div className="score-tooltip hidden group-hover:block">
                          {scoreMode === "mutagen" && entry.mutagenScore ? (
                            <>
                              <p
                                className="mb-2"
                                style={{
                                  fontSize: "10px",
                                  fontFamily: "var(--font-display)",
                                  fontWeight: 700,
                                  textTransform: "uppercase",
                                  letterSpacing: "0.1em",
                                  color: "#00F0FF",
                                }}
                              >
                                Mutagen Breakdown
                              </p>
                              {[
                                [
                                  "Mutagen Total",
                                  entry.mutagenScore.totalMutagen.toFixed(4),
                                ],
                                [
                                  "Trade Count",
                                  String(entry.mutagenScore.tradeCount),
                                ],
                              ].map(([k, v]) => (
                                <div key={k} className="score-tooltip-row">
                                  <span>{k}</span>
                                  <strong className="value-positive">
                                    {v}
                                  </strong>
                                </div>
                              ))}
                              <div
                                className="score-tooltip-row mt-2 border-t border-white/10 pt-2 text-white/40"
                                style={{ fontSize: "9px" }}
                              >
                                Formula: (Perf + Dur) x Size x Bonus
                              </div>
                            </>
                          ) : (
                            <>
                              <p
                                className="mb-2"
                                style={{
                                  fontSize: "10px",
                                  fontFamily: "var(--font-display)",
                                  fontWeight: 700,
                                  textTransform: "uppercase",
                                  letterSpacing: "0.1em",
                                  color: "rgba(255,255,255,0.4)",
                                }}
                              >
                                Score Breakdown
                              </p>
                              {[
                                [
                                  "P&L",
                                  `+${(entry.pnlPercent * 8.5).toFixed(1)}`,
                                ],
                                [
                                  "Volume",
                                  `+${(Math.log10(entry.volumeUsd + 1) * 6).toFixed(1)}`,
                                ],
                                [
                                  "Consistency",
                                  `+${(entry.consistencyScore * 0.28).toFixed(1)}`,
                                ],
                                [
                                  "Win Rate",
                                  `+${(entry.winRate * 0.08).toFixed(1)}`,
                                ],
                                [
                                  "DD Penalty",
                                  `−${(entry.maxDrawdownPercent * 0.65).toFixed(1)}`,
                                ],
                              ].map(([k, v]) => (
                                <div key={k} className="score-tooltip-row">
                                  <span>{k}</span>
                                  <strong
                                    className={
                                      v.startsWith("−")
                                        ? "value-negative"
                                        : "value-positive"
                                    }
                                  >
                                    {v}
                                  </strong>
                                </div>
                              ))}
                              <div className="score-tooltip-row mt-2 border-t border-white/10 pt-2">
                                <span>Total</span>
                                <strong className="value-accent">
                                  {entry.tournamentScore}
                                </strong>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    </td>
                    <td
                      className={
                        entry.pnlPercent >= 0
                          ? "value-positive"
                          : "value-negative"
                      }
                    >
                      {formatSignedNumber(entry.pnlPercent)}%
                    </td>
                    <td>{formatCurrency(entry.volumeUsd)}</td>
                    <td>{formatPercent(entry.winRate)}</td>
                    <td>{entry.tradeCount ?? "—"}</td>
                    <td>{entry.activeDays ?? "—"}</td>
                    <td>
                      {equityByWallet[entry.wallet]?.length > 1 && (
                        <EquitySparkline
                          points={equityByWallet[entry.wallet]}
                        />
                      )}
                    </td>
                    <td>
                      {entry.eligible ? (
                        <span className="status-okay">Eligible</span>
                      ) : (
                        <span
                          className="status-flagged"
                          title={entry.disqualificationReason}
                        >
                          ⚠ Flagged
                        </span>
                      )}
                    </td>
                    <td>
                      <a
                        href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(
                          `Ranked #${entry.displayRank} in ${selectedCohort.name} on @aabornyxyz Prop Challenge! PnL: ${formatSignedNumber(entry.pnlPercent)}% | Score: ${entry.tournamentScore} 🏆\n\nhttps://adrena.xyz`
                        )}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center justify-center text-white/30 transition hover:bg-white/10 hover:text-white/70"
                        style={{
                          width: "24px",
                          height: "24px",
                          borderRadius: "2px",
                        }}
                        title="Share on X"
                      >
                        <svg
                          viewBox="0 0 24 24"
                          className="h-3.5 w-3.5 fill-current"
                          aria-hidden="true"
                        >
                          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                        </svg>
                      </a>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <aside
        className="panel space-y-5"
        style={{
          borderLeft: "3px solid var(--accent)",
          borderRadius: "2px",
        }}
      >
        <h2
          className="section-title"
          style={{
            fontFamily: "var(--font-display)",
            textTransform: "uppercase",
            letterSpacing: "0.1em",
          }}
        >
          Payouts
        </h2>

        <div className="space-y-3">
          {selectedCohort.rewardPreview.map((reward) => (
            <div
              key={reward.wallet}
              className="reward-card"
              style={{ borderRadius: "2px" }}
            >
              <div>
                <span
                  style={{
                    fontSize: "10px",
                    fontFamily: "var(--font-display)",
                    textTransform: "uppercase",
                    letterSpacing: "0.2em",
                    color: "rgba(255,255,255,0.45)",
                  }}
                >
                  Rank #{reward.rank}
                </span>
                <p className="mt-1 text-lg font-semibold">
                  {reward.displayName}
                </p>
              </div>
              <div className="text-right">
                <strong
                  style={{ fontFamily: "var(--font-mono)", color: "#00F0FF" }}
                >
                  {formatCurrency(reward.payoutUsd)}
                </strong>
                <p
                  style={{
                    fontSize: "13px",
                    color: "rgba(255,255,255,0.55)",
                    fontFamily: "var(--font-mono)",
                  }}
                >
                  {reward.fundedStatus} / {reward.revenueShareBps} bps
                </p>
              </div>
            </div>
          ))}
        </div>

        <div className="divider" />

        <div className="space-y-3">
          <p
            className="eyebrow"
            style={{
              fontFamily: "var(--font-display)",
              textTransform: "uppercase",
              letterSpacing: "0.15em",
            }}
          >
            Viewer outcome
          </p>
          <div className="metric-line">
            <span>Enrollment</span>
            <strong style={{ fontFamily: "var(--font-mono)" }}>
              {enrolledCohortId ? "Active" : "Not entered"}
            </strong>
          </div>
          <div className="metric-line">
            <span>Projected payout</span>
            <strong style={{ fontFamily: "var(--font-mono)" }}>
              {viewerRewardPreview
                ? formatCurrency(viewerRewardPreview.payoutUsd)
                : "Outside top five"}
            </strong>
          </div>
          <div className="metric-line">
            <span>Funded season state</span>
            <strong style={{ fontFamily: "var(--font-mono)" }}>
              {viewerFundedStatus}
            </strong>
          </div>
        </div>
      </aside>
    </section>
  );
}
