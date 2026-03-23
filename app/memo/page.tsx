export const dynamic = "force-dynamic";

import Link from "next/link";

import {
  comparisonRows,
  judgeProofPoints,
  rolloutMilestones,
} from "@/lib/world-cup/content";
import {
  createCupLeaderboard,
  createFinalsBracket,
  createPayoutPreview,
  createSeasonSimulation,
  formatCompactUsd,
  type WorldCupData,
} from "@/lib/world-cup/engine";
import { cups } from "@/lib/world-cup/cups";
import { competitionPresets } from "@/lib/world-cup/scenarios";
import { loadWorldCupTraders, loadDesks } from "@/lib/world-cup/data";
import { PrintButton } from "./print-button";

export default async function MemoPage() {
  const [traders, desks] = await Promise.all([loadWorldCupTraders(), loadDesks()]);
  const data: WorldCupData = { traders, desks };

  const preset =
    competitionPresets.find((item) => item.id === "spectator-finals") ??
    competitionPresets[0];
  const leaderboard = createCupLeaderboard({
    cupId: preset.cupId,
    scenarioId: preset.scenarioId,
    weights: preset.weights,
    guardrails: preset.guardrails,
    data,
  });
  const payoutPreview = createPayoutPreview({
    cupId: preset.cupId,
    scenarioId: preset.scenarioId,
    weights: preset.weights,
    guardrails: preset.guardrails,
    data,
  });
  const finalsBracket = createFinalsBracket({
    scenarioId: preset.scenarioId,
    weights: preset.weights,
    guardrails: preset.guardrails,
    data,
  });
  const simulation = createSeasonSimulation({
    weights: preset.weights,
    guardrails: preset.guardrails,
  });
  const currentCup = cups.find((cup) => cup.id === preset.cupId) ?? cups[0];

  return (
    <main className="min-h-screen bg-[#f5f1e8] px-4 py-8 text-[#101826] sm:px-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="no-print flex flex-wrap items-center justify-between gap-3">
          <Link
            href="/"
            className="rounded-[2px] border border-black/10 bg-white px-4 py-2 text-sm font-medium text-[#101826]"
          >
            Back to prototype
          </Link>
          <PrintButton />
        </div>

        <section className="rounded-[2rem] border border-black/10 bg-white px-6 py-7 shadow-[0_24px_80px_-48px_rgba(0,0,0,0.25)] sm:px-8">
          <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-black/45">
            Adrena bounty submission memo
          </p>
          <h1 className="mt-4 max-w-4xl font-display text-4xl font-semibold tracking-[-0.04em] text-[#101826] sm:text-5xl">
            World Cup 2.0 is a season-based competition system built to turn
            Adrena&apos;s RWA moat into repeatable engagement.
          </h1>
          <p className="mt-4 max-w-3xl text-base leading-7 text-black/68">
            The format combines asset-class identity, desk competition,
            qualification drama, supporter loops, and ops-visible guardrails so
            competitions feel like a flagship product, not a leaderboard skin.
          </p>

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <div className="rounded-[4px] border border-black/10 bg-[#f8f5ee] px-4 py-4">
              <p className="text-[11px] uppercase tracking-[0.22em] text-black/45">
                Anchor fact
              </p>
              <p className="mt-2 text-lg font-semibold text-[#101826]">
                50% of 2025 volume came from competitions
              </p>
            </div>
            <div className="rounded-[4px] border border-black/10 bg-[#f8f5ee] px-4 py-4">
              <p className="text-[11px] uppercase tracking-[0.22em] text-black/45">
                Signature mechanic
              </p>
              <p className="mt-2 text-lg font-semibold text-[#101826]">
                Cups + desks + finals
              </p>
            </div>
            <div className="rounded-[4px] border border-black/10 bg-[#f8f5ee] px-4 py-4">
              <p className="text-[11px] uppercase tracking-[0.22em] text-black/45">
                Preset shown here
              </p>
              <p className="mt-2 text-lg font-semibold text-[#101826]">
                {preset.label}
              </p>
            </div>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
          <div className="rounded-[2rem] border border-black/10 bg-white p-6">
            <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-black/42">
              Why it wins
            </p>
            <div className="mt-5 space-y-3">
              {judgeProofPoints.map((point) => (
                <div
                  key={point.title}
                  className="rounded-[4px] border border-black/10 bg-[#f8f5ee] p-4"
                >
                  <p className="text-sm font-semibold text-[#101826]">
                    {point.title}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-black/64">
                    {point.summary}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[2rem] border border-black/10 bg-white p-6">
            <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-black/42">
              Business impact
            </p>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {simulation.metrics.slice(0, 4).map((metric) => (
                <div
                  key={metric.label}
                  className="rounded-[4px] border border-black/10 bg-[#f8f5ee] p-4"
                >
                  <p className="text-sm font-semibold text-[#101826]">
                    {metric.label}
                  </p>
                  <p className="mt-2 text-2xl font-semibold text-[#101826]">
                    {metric.projected}
                    {metric.suffix}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-black/60">
                    Baseline {metric.baseline}
                    {metric.suffix}. {metric.summary}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="rounded-[2rem] border border-black/10 bg-white p-6">
          <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-black/42">
            Comparison matrix
          </p>
          <div className="mt-5 space-y-3">
            {comparisonRows.map((row) => (
              <div
                key={row.dimension}
                className="grid gap-4 rounded-[4px] border border-black/10 bg-[#f8f5ee] p-4 lg:grid-cols-[0.7fr_1fr_1fr]"
              >
                <div>
                  <p className="text-sm font-semibold text-[#101826]">
                    {row.dimension}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-black/58">
                    {row.whyItMatters}
                  </p>
                </div>
                <div>
                  <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-black/40">
                    Plain competition
                  </p>
                  <p className="mt-2 text-sm leading-6 text-black/64">
                    {row.baseline}
                  </p>
                </div>
                <div>
                  <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-black/40">
                    World Cup 2.0
                  </p>
                  <p className="mt-2 text-sm leading-6 text-black/78">
                    {row.worldCup}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="rounded-[2rem] border border-black/10 bg-white p-6">
            <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-black/42">
              Live payout preview
            </p>
            <div className="mt-5 overflow-hidden rounded-[1.5rem] border border-black/10">
              <div className="grid grid-cols-[0.6fr_1fr_1.2fr_0.9fr] gap-3 bg-[#f0ebe1] px-4 py-3 text-[11px] uppercase tracking-[0.18em] text-black/42">
                <p>Rank</p>
                <p>Trader</p>
                <p>Payout</p>
                <p>Status</p>
              </div>
              <div className="divide-y divide-black/10">
                {payoutPreview.map((row) => (
                  <div
                    key={`${row.rank}-${row.recipient}`}
                    className="grid grid-cols-[0.6fr_1fr_1.2fr_0.9fr] gap-3 bg-white px-4 py-4 text-sm text-black/74"
                  >
                    <div>
                      <p className="font-semibold text-[#101826]">{row.rank}</p>
                      <p className="mt-1 text-xs text-black/44">{row.reason}</p>
                    </div>
                    <p className="font-medium text-[#101826]">
                      {row.recipient}
                    </p>
                    <p>{row.payout}</p>
                    <p
                      className={
                        row.status === "Approved"
                          ? "font-medium text-[#0f766e]"
                          : "font-medium text-[#b45309]"
                      }
                    >
                      {row.status}
                    </p>
                  </div>
                ))}
              </div>
            </div>
            <p className="mt-4 text-sm leading-6 text-black/58">
              Preview shown for {currentCup.name} under the {preset.label}{" "}
              policy.
            </p>
          </div>

          <div className="rounded-[2rem] border border-black/10 bg-white p-6">
            <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-black/42">
              Finals bracket
            </p>
            <div className="mt-5 space-y-3">
              {finalsBracket.semiFinals.map((match) => (
                <div
                  key={match.label}
                  className="rounded-[4px] border border-black/10 bg-[#f8f5ee] p-4"
                >
                  <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-black/42">
                    {match.label}
                  </p>
                  <p className="mt-2 text-sm font-semibold text-[#101826]">
                    {(match.left?.trader.alias ?? "TBD") +
                      " vs " +
                      (match.right?.trader.alias ?? "TBD")}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-black/60">
                    Winner: {match.winner?.trader.alias ?? "TBD"} by{" "}
                    {match.margin.toFixed(1)} points.
                  </p>
                </div>
              ))}
              <div className="rounded-[4px] border border-black/10 bg-[#101826] p-4 text-white">
                <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-white/52">
                  Grand Final
                </p>
                <p className="mt-2 text-sm font-semibold">
                  {(finalsBracket.final.left?.trader.alias ?? "TBD") +
                    " vs " +
                    (finalsBracket.final.right?.trader.alias ?? "TBD")}
                </p>
                <p className="mt-2 text-sm leading-6 text-white/72">
                  Projected champion:{" "}
                  {finalsBracket.final.winner?.trader.alias ?? "TBD"}.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-[2rem] border border-black/10 bg-white p-6">
          <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-black/42">
            Rollout path
          </p>
          <div className="mt-5 grid gap-3 lg:grid-cols-3">
            {rolloutMilestones.map((milestone) => (
              <div
                key={milestone.phase}
                className="rounded-[4px] border border-black/10 bg-[#f8f5ee] p-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-[#101826]">
                    {milestone.phase}
                  </p>
                  <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-black/40">
                    {milestone.duration}
                  </p>
                </div>
                <p className="mt-3 text-sm leading-6 text-black/64">
                  {milestone.goal}
                </p>
                <p className="mt-3 text-sm leading-6 text-black/78">
                  {milestone.outputs}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-[2rem] border border-black/10 bg-white p-6">
          <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-black/42">
            Snapshot leaderboard
          </p>
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {leaderboard.slice(0, 4).map((entry) => (
              <div
                key={entry.trader.id}
                className="rounded-[4px] border border-black/10 bg-[#f8f5ee] p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-[#101826]">
                      #{entry.rank} {entry.trader.alias}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-black/60">
                      {entry.trader.tag}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-[#101826]">
                      {entry.score.toFixed(1)}
                    </p>
                    <p className="text-xs text-black/44">
                      {formatCompactUsd(entry.metrics.realizedPnl)}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
