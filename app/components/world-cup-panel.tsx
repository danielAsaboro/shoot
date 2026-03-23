"use client";

import { useDeferredValue, useEffect, useState, useTransition } from "react";
import { useSafeWallets as useWallets } from "@/app/hooks/use-safe-privy";

import {
  createCupLeaderboard,
  createDeskStandings,
  createFinalsBracket,
  createGrandFinalists,
  createPayoutPreview,
  createSeasonSimulation,
  createTransferWindow,
  createFullBracket,
  getDefaultTwists,
  findGoldenTrade,
  getViewerDesk,
  normalizeWeights,
  formatCompactUsd,
  formatPercent,
  type WorldCupData,
} from "@/lib/world-cup/engine";
import { generateNarrativeBeats } from "@/lib/world-cup/narrative";
import { defaultWeights, defaultGuardrails } from "@/lib/world-cup/types";
import type {
  AssetClassId,
  ScenarioId,
  ScoreWeights,
  Guardrails,
  TransferMove,
} from "@/lib/world-cup/types";
import { cups } from "@/lib/world-cup/cups";
import { scenarios, competitionPresets } from "@/lib/world-cup/scenarios";
import { WorldCupBracket } from "./world-cup-bracket";
import { WorldCupGroupStage } from "./world-cup-group-stage";
import { WorldCupFullBracket } from "./world-cup-full-bracket";
import { WorldCupGoldenTrade } from "./world-cup-golden-trade";
import { WorldCupCommentary } from "./world-cup-commentary";

type ViewMode = "trader" | "organizer";
type WeightField = keyof ScoreWeights;
type GuardrailField = keyof Guardrails;

const cupTone: Record<
  AssetClassId,
  {
    chip: string;
    panel: string;
    ring: string;
    glow: string;
    icon: string;
    accent: string;
  }
> = {
  crypto: {
    chip: "border",
    panel: "from-[#3D7FFF]/20 via-[#3D7FFF]/8 to-transparent",
    ring: "border-[#3D7FFF]/55",
    glow: "shadow-[0_20px_120px_-40px_rgba(61,127,255,1)]",
    icon: "₿",
    accent: "#3D7FFF",
  },
  metals: {
    chip: "border",
    panel: "from-[#BFFF00]/20 via-[#BFFF00]/8 to-transparent",
    ring: "border-[#BFFF00]/55",
    glow: "shadow-[0_20px_120px_-40px_rgba(191,255,0,1)]",
    icon: "◆",
    accent: "#BFFF00",
  },
  energy: {
    chip: "border",
    panel: "from-[#FF3D3D]/20 via-[#FF3D3D]/8 to-transparent",
    ring: "border-[#FF3D3D]/55",
    glow: "shadow-[0_20px_120px_-40px_rgba(255,61,61,1)]",
    icon: "▲",
    accent: "#FF3D3D",
  },
  forex: {
    chip: "border",
    panel: "from-[#00FF87]/20 via-[#00FF87]/8 to-transparent",
    ring: "border-[#00FF87]/55",
    glow: "shadow-[0_20px_120px_-40px_rgba(0,255,135,1)]",
    icon: "◎",
    accent: "#00FF87",
  },
};

const scoringLabels: { field: WeightField; label: string; summary: string }[] =
  [
    {
      field: "riskAdjustedPnl",
      label: "Risk-adjusted PnL",
      summary:
        "Still matters most, but not enough to dominate the entire league.",
    },
    {
      field: "consistency",
      label: "Consistency",
      summary:
        "Rewards repeated clean sessions and protects against one-hit leaders.",
    },
    {
      field: "missionProgress",
      label: "Mission progress",
      summary:
        "Turns quests into meaningful rank movement instead of background XP.",
    },
    {
      field: "streakPower",
      label: "Streak power",
      summary:
        "Keeps return behavior visible and directly connected to qualification.",
    },
    {
      field: "raffleBonus",
      label: "Raffle bonus",
      summary:
        "Preserves upside for active mid-table traders who stay eligible.",
    },
  ];

const guardrailLabels: {
  field: GuardrailField;
  label: string;
  min: number;
  max: number;
  step: number;
  formatter: (value: number) => string;
  summary: string;
}[] = [
  {
    field: "minVolume",
    label: "Min eligible volume",
    min: 25000,
    max: 200000,
    step: 5000,
    formatter: formatCompactUsd,
    summary: "Stops low-effort participation from farming rewards.",
  },
  {
    field: "minTrades",
    label: "Min trade count",
    min: 6,
    max: 30,
    step: 1,
    formatter: (value) => `${value} trades`,
    summary: "Prevents single-bet sniping from shaping the table.",
  },
  {
    field: "maxSingleTradeShare",
    label: "Max single-trade impact",
    min: 20,
    max: 70,
    step: 1,
    formatter: formatPercent,
    summary: "Protects the competition from one-lucky-trade leaderboards.",
  },
];

function pillClass(active: boolean) {
  return active
    ? "border-[var(--border-default)] bg-white/10 text-white shadow-[0_12px_40px_-30px_rgba(255,255,255,0.8)]"
    : "border-[var(--border-default)] bg-white/5 text-white/70 hover:border-white/20 hover:bg-white/8";
}

function scoreBar(score: number) {
  return `${Math.max(6, Math.min(score, 100))}%`;
}

function rankingTone(rank: number) {
  if (rank === 1) return "text-[#BFFF00]";
  if (rank === 2) return "text-white";
  return "text-white/70";
}

function deltaTone(
  betterDirection: "higher" | "lower",
  baseline: number,
  projected: number
) {
  const improved =
    betterDirection === "higher"
      ? projected >= baseline
      : projected <= baseline;
  return improved ? "text-[#00FF87]" : "text-[#FF3D3D]";
}

function loadSavedPanelState() {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem("world-cup-panel-state");
    return raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
  } catch {
    window.localStorage.removeItem("world-cup-panel-state");
    return null;
  }
}

function chipStyle(accent: string) {
  return {
    backgroundColor: `${accent}30`,
    color: accent,
    borderColor: `${accent}66`,
  };
}

// ── Transfer window narratives (static config, not trader data) ──────────────
const transferWindowMoves: Record<AssetClassId, TransferMove[]> = {
  crypto: [
    {
      deskId: "crypto-atlas",
      type: "Draft",
      incoming: "Jules Mercer",
      summary:
        "Atlas Desk drafts a macro-meme crossover specialist for finals week.",
      impact: "Raises opening-session win probability and social pull.",
    },
    {
      deskId: "crypto-latency",
      type: "Promotion",
      incoming: "Wildcard qualifier",
      summary:
        "Latency promotes its mission leader into the active finals roster.",
      impact: "Makes non-elite quest grinders relevant during the season.",
    },
  ],
  metals: [
    {
      deskId: "metals-gild",
      type: "Loan",
      incoming: "Hana Brooke",
      outgoing: "Luis Garcia",
      summary:
        "Gild Desk borrows a low-drawdown closer for the knockout phase.",
      impact: "Gives the cup a tactical transfer week instead of dead time.",
    },
    {
      deskId: "metals-vault",
      type: "Promotion",
      incoming: "Vault academy runner",
      summary: "Vault rewards the best mission runner with a desk call-up.",
      impact: "Connects regular participation to roster mobility.",
    },
  ],
  energy: [
    {
      deskId: "energy-grid",
      type: "Draft",
      incoming: "Reese Nolan",
      summary:
        "Grid Desk drafts an event-window specialist for the final stretch.",
      impact: "Adds narrative around OPEC and macro event weeks.",
    },
    {
      deskId: "energy-refinery",
      type: "Promotion",
      incoming: "Mission captain",
      summary:
        "Refinery elevates the best clean-risk performer into the active desk lineup.",
      impact: "Reinforces guardrails instead of rewarding raw aggression only.",
    },
  ],
  forex: [
    {
      deskId: "forex-orbit",
      type: "Loan",
      incoming: "Mina Hart",
      outgoing: "Darren Lim",
      summary: "Orbit rotates in a London open specialist before finals week.",
      impact: "Makes session identity visible and strategically legible.",
    },
    {
      deskId: "forex-fix",
      type: "Promotion",
      incoming: "Fix reserve captain",
      summary: "Fix promotes its most consistent qualifier into the main desk.",
      impact: "Turns steady cadence into a real roster path.",
    },
  ],
};

export function WorldCupPanel() {
  const { wallets } = useWallets();

  // ── Load trader & desk data from DB via API ─────────────────────────────
  const [worldCupData, setWorldCupData] = useState<WorldCupData | null>(null);

  useEffect(() => {
    fetch("/api/world-cup/traders")
      .then((res) => res.json())
      .then((json) => {
        setWorldCupData({
          traders: json.traders,
          desks: json.desks,
          transferMoves: transferWindowMoves,
        });
      })
      .catch((err) => console.error("Failed to load World Cup data:", err));
  }, []);

  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    const s = loadSavedPanelState();
    return (s?.viewMode as ViewMode | undefined) ?? "trader";
  });
  const [activePresetId, setActivePresetId] = useState<string>(() => {
    const s = loadSavedPanelState();
    return (s?.activePresetId as string | undefined) ?? "launch-week";
  });
  const [selectedCup, setSelectedCup] = useState<AssetClassId>(() => {
    const s = loadSavedPanelState();
    return (s?.selectedCup as AssetClassId | undefined) ?? "crypto";
  });
  const [selectedScenario, setSelectedScenario] = useState<ScenarioId>(() => {
    const s = loadSavedPanelState();
    return (s?.selectedScenario as ScenarioId | undefined) ?? "bubble";
  });
  const [weights, setWeights] = useState<typeof defaultWeights>(() => {
    const s = loadSavedPanelState();
    return (s?.weights as typeof defaultWeights | undefined) ?? defaultWeights;
  });
  const [guardrails, setGuardrails] = useState<typeof defaultGuardrails>(() => {
    const s = loadSavedPanelState();
    return (
      (s?.guardrails as typeof defaultGuardrails | undefined) ??
      defaultGuardrails
    );
  });
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    window.localStorage.setItem(
      "world-cup-panel-state",
      JSON.stringify({
        viewMode,
        activePresetId,
        selectedCup,
        selectedScenario,
        weights,
        guardrails,
      })
    );
  }, [
    viewMode,
    activePresetId,
    selectedCup,
    selectedScenario,
    weights,
    guardrails,
  ]);

  const deferredCup = useDeferredValue(selectedCup);
  const deferredScenario = useDeferredValue(selectedScenario);
  const deferredWeights = useDeferredValue(weights);
  const deferredGuardrails = useDeferredValue(guardrails);
  const normalizedWeights = normalizeWeights(deferredWeights);
  const currentCup = cups.find((cup) => cup.id === deferredCup) ?? cups[0];
  const currentScenario =
    scenarios.find((s) => s.id === deferredScenario) ?? scenarios[0];

  const walletAddress = wallets[0]?.address;

  // Wait for data to load from DB
  if (!worldCupData) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center space-y-3">
          <div className="h-8 w-8 mx-auto animate-spin rounded-full border-2 border-white/20 border-t-white/80" />
          <p className="text-sm text-white/50">Loading World Cup data...</p>
        </div>
      </div>
    );
  }

  const data = worldCupData;

  const leaderboard = createCupLeaderboard({
    cupId: deferredCup,
    scenarioId: deferredScenario,
    weights: deferredWeights,
    guardrails: deferredGuardrails,
    walletAddress,
    data,
  });

  const viewerEntry =
    leaderboard.find((entry) => entry.trader.id === "viewer-trader") ??
    leaderboard[0];

  const finalists = createGrandFinalists({
    scenarioId: deferredScenario,
    weights: deferredWeights,
    guardrails: deferredGuardrails,
    walletAddress,
    data,
  });

  const deskStandings = createDeskStandings({
    cupId: deferredCup,
    scenarioId: deferredScenario,
    weights: deferredWeights,
    guardrails: deferredGuardrails,
    walletAddress,
    data,
  });

  const seasonSimulation = createSeasonSimulation({
    weights: deferredWeights,
    guardrails: deferredGuardrails,
  });

  const finalsBracket = createFinalsBracket({
    scenarioId: deferredScenario,
    weights: deferredWeights,
    guardrails: deferredGuardrails,
    walletAddress,
    data,
  });

  const transferWindow = createTransferWindow(deferredCup, data);
  const viewerDesk = getViewerDesk(deferredCup, data);

  // Full tournament bracket (group stage + knockout)
  const twists = getDefaultTwists();
  const fullBracket = createFullBracket({
    cupId: deferredCup,
    scenarioId: deferredScenario,
    weights: deferredWeights,
    guardrails: deferredGuardrails,
    walletAddress,
    twists,
    data,
  });
  const goldenTrade = findGoldenTrade(fullBracket);
  const narrativeBeats = generateNarrativeBeats(fullBracket, goldenTrade);

  const payoutPreview = createPayoutPreview({
    cupId: deferredCup,
    scenarioId: deferredScenario,
    weights: deferredWeights,
    guardrails: deferredGuardrails,
    walletAddress,
    data,
  });

  const qualificationLine = leaderboard.filter((entry) => entry.eligible)[
    currentCup.finalsSlots - 1
  ];
  const pointsGap = qualificationLine
    ? Number((qualificationLine.score - viewerEntry.score).toFixed(1))
    : 0;
  const flaggedCount = leaderboard.filter(
    (entry) => entry.flags.length > 0
  ).length;

  function updateWeight(field: WeightField, value: number) {
    startTransition(() => {
      setActivePresetId("custom");
      setWeights((current) => ({ ...current, [field]: value }));
    });
  }

  function updateGuardrail(field: GuardrailField, value: number) {
    startTransition(() => {
      setActivePresetId("custom");
      setGuardrails((current) => ({ ...current, [field]: value }));
    });
  }

  function applyPreset(presetId: string) {
    const preset = competitionPresets.find((item) => item.id === presetId);
    if (!preset) return;
    startTransition(() => {
      setActivePresetId(preset.id);
      setSelectedCup(preset.cupId);
      setSelectedScenario(preset.scenarioId);
      setWeights(preset.weights);
      setGuardrails(preset.guardrails);
    });
  }

  const currentTone = cupTone[currentCup.id];

  return (
    <div className="flex flex-col gap-6">
      {/* Control bar: view mode, cup selector, scenario picker */}
      <section className="panel">
        <div className="grid gap-4 xl:grid-cols-[0.85fr_1.15fr_1.15fr]">
          {/* View mode */}
          <div className="rounded-[4px] border border-white/10 bg-white/5 p-4">
            <p className="eyebrow font-[var(--font-display)] uppercase tracking-[0.18em]">
              Point of view
            </p>
            <div className="mt-3 flex gap-2">
              {(["trader", "organizer"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setViewMode(mode)}
                  className={`rounded-[2px] border px-4 py-2 text-sm font-medium uppercase tracking-wider transition ${pillClass(
                    viewMode === mode
                  )}`}
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  {mode}
                </button>
              ))}
            </div>
          </div>

          {/* Cup selector */}
          <div className="rounded-[4px] border border-white/10 bg-white/5 p-4">
            <p className="eyebrow font-[var(--font-display)] uppercase tracking-[0.18em]">
              Asset class cup
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {cups.map((cup) => {
                const tone = cupTone[cup.id];
                return (
                  <button
                    key={cup.id}
                    type="button"
                    onClick={() => setSelectedCup(cup.id)}
                    className={`relative overflow-hidden rounded-[4px] border bg-gradient-to-br px-4 py-4 text-left transition ${
                      selectedCup === cup.id
                        ? `${tone.panel} ${tone.ring} ${tone.glow}`
                        : "border-white/8 from-white/6 via-white/3 to-transparent hover:border-white/18"
                    }`}
                  >
                    {/* Top accent stripe */}
                    <div
                      className="absolute inset-x-0 top-0 h-[3px]"
                      style={{
                        background: `linear-gradient(90deg, ${tone.accent}00, ${tone.accent}, ${tone.accent}00)`,
                        opacity: selectedCup === cup.id ? 1 : 0.55,
                      }}
                    />
                    {/* Watermark icon */}
                    <span
                      className="pointer-events-none select-none absolute -right-1 -top-2 text-[80px] font-black leading-none"
                      style={{
                        color: tone.accent,
                        opacity: selectedCup === cup.id ? 0.32 : 0.18,
                      }}
                      aria-hidden="true"
                    >
                      {tone.icon}
                    </span>
                    {/* Content */}
                    <div className="relative z-10">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-1.5">
                          <span
                            className="rounded-[2px] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.22em]"
                            style={chipStyle(tone.accent)}
                          >
                            {cup.badge}
                          </span>
                          <span
                            className="text-[14px] leading-none font-bold"
                            style={{ color: tone.accent, opacity: 0.9 }}
                            aria-hidden="true"
                          >
                            {tone.icon}
                          </span>
                        </div>
                        <span
                          className="text-[11px] uppercase tracking-[0.22em] text-white/45"
                          style={{ fontFamily: "var(--font-mono)" }}
                        >
                          {cup.markets.join(" / ")}
                        </span>
                      </div>
                      <p className="mt-3 text-base font-semibold text-white">
                        {cup.name}
                      </p>
                      <p className="mt-2 text-sm leading-6 text-white/62">
                        {cup.strapline}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Scenario picker */}
          <div className="rounded-[4px] border border-white/10 bg-white/5 p-4">
            <p className="eyebrow font-[var(--font-display)] uppercase tracking-[0.18em]">
              Scenario simulation
            </p>
            <div className="mt-3 grid gap-2">
              {scenarios.map((scenario) => (
                <button
                  key={scenario.id}
                  type="button"
                  onClick={() => setSelectedScenario(scenario.id)}
                  className={`rounded-[4px] border px-4 py-3 text-left transition ${
                    selectedScenario === scenario.id
                      ? "border-white/22 bg-white/10"
                      : "border-white/8 bg-white/4 hover:border-white/16 hover:bg-white/7"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <p
                      className="text-sm font-semibold text-white"
                      style={{
                        fontFamily: "var(--font-display)",
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                      }}
                    >
                      {scenario.label}
                    </p>
                    <span
                      className="text-[11px] uppercase tracking-[0.22em] text-white/45"
                      style={{ fontFamily: "var(--font-mono)" }}
                    >
                      {scenario.phase}
                    </span>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-white/58">
                    {scenario.summary}
                  </p>
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Main content area */}
      <section className="grid gap-6 xl:grid-cols-[1.4fr_0.92fr]">
        {/* Left panel: trader/organizer content */}
        <div className="panel">
          <div className="flex flex-col gap-3 border-b border-white/10 pb-5 md:flex-row md:items-end md:justify-between">
            <div className="space-y-2">
              <h2
                className="section-title"
                style={{
                  fontFamily: "var(--font-display)",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                }}
              >
                {viewMode === "trader"
                  ? `${currentCup.name} trader cockpit`
                  : "Organizer controls and integrity desk"}
              </h2>
              <p className="section-copy">
                {viewMode === "trader"
                  ? "Score mix, qualification pressure, missions, rewards, and finals progression in one view."
                  : "Adjust scoring logic, tighten guardrails, and see who stays eligible before rewards are locked."}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span
                className="rounded-[2px] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em]"
                style={chipStyle(currentTone.accent)}
              >
                {currentScenario.phase}
              </span>
              <span className="rounded-[2px] border border-white/10 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-[0.22em] text-white/60">
                {isPending ? "Syncing simulation" : currentScenario.label}
              </span>
            </div>
          </div>

          {viewMode === "trader" ? (
            <div className="mt-6 space-y-6">
              {/* Viewer trader card */}
              <div
                className={`rounded-[4px] border bg-gradient-to-br p-5 ${
                  cupTone[currentCup.id].panel
                } ${cupTone[currentCup.id].ring}`}
              >
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div className="space-y-3">
                    <span
                      className="inline-flex rounded-[2px] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em]"
                      style={chipStyle(currentTone.accent)}
                    >
                      {currentCup.badge} specialist
                    </span>
                    <div>
                      <h3
                        className="text-2xl font-semibold tracking-tight text-white"
                        style={{
                          fontFamily: "var(--font-display)",
                          textTransform: "uppercase",
                          letterSpacing: "0.04em",
                        }}
                      >
                        {viewerEntry.trader.alias} in {currentCup.name}
                      </h3>
                      <p className="mt-2 max-w-xl text-sm leading-6 text-white/66">
                        {currentCup.narrative} {viewerEntry.trader.bio}
                      </p>
                      {viewerDesk ? (
                        <p className="mt-3 text-sm text-white/52">
                          Assigned desk:{" "}
                          <span className="font-semibold text-white">
                            {viewerDesk.name}
                          </span>{" "}
                          · {viewerDesk.motto}
                        </p>
                      ) : null}
                    </div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="stat-card">
                      <span>Cup rank</span>
                      <strong className={rankingTone(viewerEntry.rank)}>
                        #{viewerEntry.rank}
                      </strong>
                    </div>
                    <div className="stat-card">
                      <span>Composite score</span>
                      <strong>{viewerEntry.score.toFixed(1)}</strong>
                    </div>
                    <div className="stat-card">
                      <span>Reward path</span>
                      <strong style={{ color: "#BFFF00" }}>
                        {viewerEntry.reward.label}
                      </strong>
                    </div>
                    <div className="stat-card">
                      <span>Qualification</span>
                      <strong>{viewerEntry.qualification}</strong>
                    </div>
                  </div>
                </div>

                <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <div className="stat-card">
                    <span>Weekly volume</span>
                    <strong>
                      {formatCompactUsd(viewerEntry.metrics.weeklyVolume)}
                    </strong>
                  </div>
                  <div className="stat-card">
                    <span>Trade count</span>
                    <strong>{viewerEntry.metrics.tradeCount}</strong>
                  </div>
                  <div className="stat-card">
                    <span>Streak</span>
                    <strong>{viewerEntry.metrics.streakDays} days</strong>
                  </div>
                  <div className="stat-card">
                    <span>Raffle tickets</span>
                    <strong>{viewerEntry.metrics.raffleTickets}</strong>
                  </div>
                </div>
              </div>

              {/* Qualification drama */}
              <div className="rounded-[4px] border border-white/10 bg-white/6 p-5">
                <p className="eyebrow font-[var(--font-display)] uppercase tracking-[0.18em]">
                  Qualification drama
                </p>
                <div className="mt-4 space-y-4">
                  <div className="rounded-[4px] border border-white/10 bg-black/30 p-4">
                    <p className="text-sm text-white/56">Finals cutoff</p>
                    <p
                      className="mt-2 text-3xl font-semibold tracking-tight text-white"
                      style={{ fontFamily: "var(--font-mono)" }}
                    >
                      {qualificationLine
                        ? qualificationLine.score.toFixed(1)
                        : "--"}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-white/62">
                      {pointsGap <= 0
                        ? "You are currently inside the knockout line."
                        : `You are ${pointsGap.toFixed(1)} points from the last finals slot.`}
                    </p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="stat-card">
                      <span>Drawdown</span>
                      <strong>
                        {viewerEntry.metrics.drawdown.toFixed(1)}%
                      </strong>
                    </div>
                    <div className="stat-card">
                      <span>Realized PnL</span>
                      <strong>
                        {formatCompactUsd(viewerEntry.metrics.realizedPnl)}
                      </strong>
                    </div>
                  </div>
                </div>
              </div>

              {/* Score composition */}
              <div className="rounded-[4px] border border-white/10 bg-white/5 p-5">
                <p className="eyebrow font-[var(--font-display)] uppercase tracking-[0.18em]">
                  Score composition
                </p>
                <div className="mt-5 space-y-4">
                  {scoringLabels.map((item) => {
                    const value = viewerEntry.metrics[item.field];
                    const weight = normalizedWeights[item.field];
                    return (
                      <div key={item.field} className="space-y-2">
                        <div className="flex items-end justify-between gap-3">
                          <div>
                            <p className="text-sm font-medium text-white">
                              {item.label}
                            </p>
                            <p className="text-sm text-white/50">
                              {item.summary}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-semibold text-white">
                              {value.toFixed(0)} pts
                            </p>
                            <p
                              className="text-xs text-white/45"
                              style={{ fontFamily: "var(--font-mono)" }}
                            >
                              {weight.toFixed(0)}% weight
                            </p>
                          </div>
                        </div>
                        <div className="progress-rail">
                          <span
                            style={{
                              width: scoreBar(value),
                              backgroundColor: "var(--accent, #00F0FF)",
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Desk standings */}
              <div className="rounded-[4px] border border-white/10 bg-white/5 p-5">
                <p className="eyebrow font-[var(--font-display)] uppercase tracking-[0.18em]">
                  Desk war
                </p>
                <div className="mt-5 space-y-3">
                  {deskStandings.map((standing, index) => (
                    <div
                      key={standing.desk.id}
                      className="reward-card flex-col"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-white/72">
                              #{index + 1}
                            </span>
                            <p className="text-sm font-semibold text-white">
                              {standing.desk.name}
                            </p>
                          </div>
                          <p className="mt-2 text-sm leading-6 text-white/58">
                            {standing.desk.motto}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-semibold text-white">
                            {standing.score.toFixed(1)}
                          </p>
                          <p
                            className="text-xs text-white/45"
                            style={{ fontFamily: "var(--font-mono)" }}
                          >
                            {standing.promotion}
                          </p>
                        </div>
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <span className="rounded-[2px] border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] uppercase tracking-[0.18em] text-white/52">
                          {standing.memberCount} members
                        </span>
                        <span className="rounded-[2px] border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] uppercase tracking-[0.18em] text-white/52">
                          +{standing.supporterBonus.toFixed(1)} supporter bonus
                        </span>
                        <span className="rounded-[2px] border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] uppercase tracking-[0.18em] text-white/52">
                          MVP {standing.topPerformer}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Reward ladder */}
              <div className="rounded-[4px] border border-white/10 bg-white/5 p-5">
                <p className="eyebrow font-[var(--font-display)] uppercase tracking-[0.18em]">
                  Reward ladder
                </p>
                <div className="mt-5 grid gap-3 lg:grid-cols-2">
                  {currentCup.rewards.map((reward) => (
                    <div key={reward.label} className="reward-card">
                      <div>
                        <p className="text-sm font-semibold text-white">
                          {reward.label}
                        </p>
                        <p className="mt-2 text-sm leading-6 text-white/58">
                          {reward.summary}
                        </p>
                      </div>
                      <div className="text-right">
                        <p
                          className="text-sm font-semibold"
                          style={{ color: "#BFFF00" }}
                        >
                          {reward.payout}
                        </p>
                        <p
                          className="text-xs text-white/45"
                          style={{ fontFamily: "var(--font-mono)" }}
                        >
                          {reward.range}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            /* Organizer view */
            <div className="mt-6 space-y-6">
              {/* Presets */}
              <div className="rounded-[4px] border border-white/10 bg-white/5 p-5">
                <p className="eyebrow font-[var(--font-display)] uppercase tracking-[0.18em]">
                  Scenario presets
                </p>
                <div className="mt-5 grid gap-3 lg:grid-cols-2">
                  {competitionPresets.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => applyPreset(preset.id)}
                      className={`rounded-[4px] border p-4 text-left transition ${
                        activePresetId === preset.id
                          ? "border-white/22 bg-white/10"
                          : "border-white/10 bg-black/20 hover:border-white/20 hover:bg-white/8"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-white">
                            {preset.label}
                          </p>
                          <p className="mt-2 text-sm leading-6 text-white/56">
                            {preset.summary}
                          </p>
                        </div>
                        <p
                          className="text-[11px] uppercase tracking-[0.16em] text-white/42"
                          style={{ fontFamily: "var(--font-mono)" }}
                        >
                          {preset.cupId} / {preset.scenarioId}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
                <p className="mt-4 text-sm text-white/44">
                  Active preset:{" "}
                  <span className="font-semibold text-white">
                    {activePresetId === "custom"
                      ? "Custom policy"
                      : (competitionPresets.find((p) => p.id === activePresetId)
                          ?.label ?? "Launch Week")}
                  </span>
                </p>
              </div>

              {/* Weight sliders */}
              <div className="grid gap-4 lg:grid-cols-[1fr_0.92fr]">
                <div className="rounded-[4px] border border-white/10 bg-white/5 p-5">
                  <p className="eyebrow font-[var(--font-display)] uppercase tracking-[0.18em]">
                    Scoring weights
                  </p>
                  <div className="mt-5 space-y-4">
                    {scoringLabels.map((item) => (
                      <div key={item.field} className="slider-field">
                        <div className="metric-line">
                          <div>
                            <p className="text-sm font-semibold text-white">
                              {item.label}
                            </p>
                            <p className="mt-1 text-sm leading-6 text-white/56">
                              {item.summary}
                            </p>
                          </div>
                          <div className="text-right">
                            <strong>
                              {normalizedWeights[item.field].toFixed(0)}%
                            </strong>
                            <p
                              className="text-xs text-white/40"
                              style={{ fontFamily: "var(--font-mono)" }}
                            >
                              normalized
                            </p>
                          </div>
                        </div>
                        <input
                          className="mt-4 h-2 w-full"
                          style={{ accentColor: "var(--accent, #00F0FF)" }}
                          type="range"
                          min={0}
                          max={100}
                          step={1}
                          value={weights[item.field]}
                          onChange={(e) =>
                            updateWeight(item.field, Number(e.target.value))
                          }
                        />
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-[4px] border border-white/10 bg-white/5 p-5">
                  <p className="eyebrow font-[var(--font-display)] uppercase tracking-[0.18em]">
                    Eligibility guardrails
                  </p>
                  <div className="mt-5 space-y-4">
                    {guardrailLabels.map((item) => (
                      <div key={item.field} className="slider-field">
                        <div className="metric-line">
                          <div>
                            <p className="text-sm font-semibold text-white">
                              {item.label}
                            </p>
                            <p className="mt-1 text-sm leading-6 text-white/56">
                              {item.summary}
                            </p>
                          </div>
                          <strong>
                            {item.formatter(guardrails[item.field])}
                          </strong>
                        </div>
                        <input
                          className="mt-4 h-2 w-full"
                          style={{ accentColor: "var(--accent, #00F0FF)" }}
                          type="range"
                          min={item.min}
                          max={item.max}
                          step={item.step}
                          value={guardrails[item.field]}
                          onChange={(e) =>
                            updateGuardrail(item.field, Number(e.target.value))
                          }
                        />
                      </div>
                    ))}
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div className="stat-card">
                      <span>Flagged rows</span>
                      <strong
                        style={{
                          color: flaggedCount > 0 ? "#BFFF00" : "white",
                        }}
                      >
                        {flaggedCount}
                      </strong>
                    </div>
                    <div className="stat-card">
                      <span>Eligible finalists</span>
                      <strong>
                        {leaderboard.filter((e) => e.eligible).length}
                      </strong>
                    </div>
                  </div>
                </div>
              </div>

              {/* Payout preview */}
              <div className="rounded-[4px] border border-white/10 bg-white/5 p-5">
                <p className="eyebrow font-[var(--font-display)] uppercase tracking-[0.18em]">
                  Payout preview
                </p>
                <div className="mt-5 overflow-x-auto">
                  <table className="leaderboard-table">
                    <thead>
                      <tr>
                        <th>Rank</th>
                        <th>Recipient</th>
                        <th>Payout</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payoutPreview.map((row) => (
                        <tr key={`${row.rank}-${row.recipient}`}>
                          <td>
                            <p className="font-semibold">{row.rank}</p>
                            <p className="mt-1 text-xs text-white/42">
                              {row.reason}
                            </p>
                          </td>
                          <td className="font-medium">{row.recipient}</td>
                          <td className="text-white/78">{row.payout}</td>
                          <td>
                            <span
                              className={
                                row.status === "Approved"
                                  ? "status-okay"
                                  : "status-flagged"
                              }
                            >
                              {row.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right panel: leaderboard + finals */}
        <aside className="space-y-6">
          {/* Cup leaderboard */}
          <div className="panel">
            <p className="eyebrow font-[var(--font-display)] uppercase tracking-[0.18em]">
              Live cup table
            </p>
            <div className="mt-5 space-y-3">
              {leaderboard.map((entry) => (
                <div
                  key={entry.trader.id}
                  className={`rounded-[4px] border p-4 ${
                    entry.trader.id === "viewer-trader"
                      ? `${cupTone[currentCup.id].ring} bg-white/10`
                      : "border-white/10 bg-white/5"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-sm font-semibold ${rankingTone(
                            entry.rank
                          )}`}
                        >
                          #{entry.rank}
                        </span>
                        <p className="text-sm font-semibold text-white">
                          {entry.trader.alias}
                        </p>
                        {entry.trader.id === "viewer-trader" ? (
                          <span className="rounded-[2px] border border-white/14 bg-white/8 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-white/55">
                            you
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-2 text-sm leading-6 text-white/56">
                        {entry.trader.tag}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-semibold text-white">
                        {entry.score.toFixed(1)}
                      </p>
                      <p
                        className="text-xs text-white/45"
                        style={{ fontFamily: "var(--font-mono)" }}
                      >
                        {entry.qualification}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4">
                    <div className="progress-rail">
                      <span
                        style={{
                          width: scoreBar(entry.score),
                          backgroundColor: "var(--accent, #00F0FF)",
                        }}
                      />
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <span className="rounded-[2px] border border-white/10 bg-black/30 px-2.5 py-1 text-[11px] uppercase tracking-[0.18em] text-white/55">
                      {formatCompactUsd(entry.metrics.weeklyVolume)}
                    </span>
                    <span className="rounded-[2px] border border-white/10 bg-black/30 px-2.5 py-1 text-[11px] uppercase tracking-[0.18em] text-white/55">
                      {entry.metrics.tradeCount} trades
                    </span>
                    <span className="rounded-[2px] border border-white/10 bg-black/30 px-2.5 py-1 text-[11px] uppercase tracking-[0.18em] text-white/55">
                      {entry.metrics.streakDays}d streak
                    </span>
                  </div>

                  {entry.flags.length > 0 ? (
                    <div
                      className="mt-3 rounded-[4px] border px-3 py-3 text-xs leading-5"
                      style={{
                        borderColor: "rgba(255,61,61,0.15)",
                        backgroundColor: "rgba(255,61,61,0.08)",
                        color: "rgba(255,61,61,0.88)",
                      }}
                    >
                      {entry.flags
                        .map((flag) => `${flag.label}: ${flag.reason}`)
                        .join(" ")}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>

          {/* Grand Finals preview */}
          <div className="panel">
            <p className="eyebrow font-[var(--font-display)] uppercase tracking-[0.18em]">
              Grand Finals preview
            </p>
            <div className="mt-5 space-y-4">
              <div className="space-y-3">
                {finalists.map((entry) => {
                  const cup = cups.find(
                    (item) => item.id === entry.trader.specialization
                  );
                  if (!cup) return null;
                  return (
                    <div
                      key={`${entry.trader.specialization}-${entry.trader.id}`}
                      className="rounded-[4px] border border-white/10 bg-white/5 p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <span
                              className="rounded-[2px] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.2em]"
                              style={chipStyle(cupTone[cup.id].accent)}
                            >
                              {cup.badge}
                            </span>
                            <p className="text-sm font-semibold text-white">
                              {entry.trader.alias}
                            </p>
                          </div>
                          <p className="mt-2 text-sm text-white/56">
                            {cup.name}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-semibold text-white">
                            #{entry.rank}
                          </p>
                          <p
                            className="text-xs text-white/45"
                            style={{ fontFamily: "var(--font-mono)" }}
                          >
                            {entry.score.toFixed(1)} pts
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Knockout bracket -- visual component */}
              <div className="rounded-[4px] border border-white/10 bg-black/30 p-4">
                <WorldCupBracket
                  bracket={finalsBracket}
                  cupId={deferredCup}
                  divisionChampions={
                    finalsBracket.final.winner
                      ? [finalsBracket.final.winner]
                      : undefined
                  }
                />
              </div>
            </div>
          </div>

          {/* Golden Trade card */}
          <div className="panel">
            <WorldCupGoldenTrade trade={goldenTrade} />
          </div>

          {/* Narrative commentary feed */}
          <div className="panel">
            <WorldCupCommentary beats={narrativeBeats} maxBeats={8} />
          </div>
        </aside>
      </section>

      {/* Group Stage section */}
      <section className="panel">
        <WorldCupGroupStage groups={fullBracket.groups} cupId={deferredCup} />
      </section>

      {/* Full Knockout Bracket section */}
      <section className="panel">
        <WorldCupFullBracket
          bracket={fullBracket}
          cupId={deferredCup}
          twists={twists}
        />
      </section>

      {/* Season simulation + transfer window */}
      <section className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="panel">
          <p className="eyebrow font-[var(--font-display)] uppercase tracking-[0.18em]">
            Season simulator
          </p>
          <div className="mt-4 max-w-3xl">
            <h2
              className="section-title text-2xl"
              style={{
                fontFamily: "var(--font-display)",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
              }}
            >
              {seasonSimulation.headline}
            </h2>
            <p className="mt-3 text-sm leading-7 text-white/62">
              {seasonSimulation.summary}
            </p>
          </div>

          <div className="mt-6 grid gap-3 md:grid-cols-2">
            {seasonSimulation.metrics.map((metric) => {
              const delta = metric.projected - metric.baseline;
              const formattedDelta =
                metric.betterDirection === "lower"
                  ? `${delta <= 0 ? "" : "+"}${delta}${metric.suffix}`
                  : `${delta >= 0 ? "+" : ""}${delta}${metric.suffix}`;

              return (
                <div
                  key={metric.label}
                  className="rounded-[4px] border border-white/10 bg-white/5 p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-white">
                        {metric.label}
                      </p>
                      <p className="mt-2 text-sm leading-6 text-white/56">
                        {metric.summary}
                      </p>
                    </div>
                    <p
                      className={`text-sm font-semibold ${deltaTone(
                        metric.betterDirection,
                        metric.baseline,
                        metric.projected
                      )}`}
                    >
                      {formattedDelta}
                    </p>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <div className="rounded-[4px] border border-white/10 bg-black/30 p-3">
                      <p
                        className="text-[11px] uppercase tracking-[0.16em] text-white/38"
                        style={{ fontFamily: "var(--font-mono)" }}
                      >
                        current
                      </p>
                      <p className="mt-2 text-lg font-semibold text-white/72">
                        {metric.baseline}
                        {metric.suffix}
                      </p>
                    </div>
                    <div
                      className="rounded-[4px] border p-3"
                      style={{
                        borderColor: "rgba(0,255,135,0.12)",
                        backgroundColor: "rgba(0,255,135,0.06)",
                      }}
                    >
                      <p
                        className="text-[11px] uppercase tracking-[0.16em]"
                        style={{
                          fontFamily: "var(--font-mono)",
                          color: "rgba(0,255,135,0.62)",
                        }}
                      >
                        world cup 2.0
                      </p>
                      <p
                        className="mt-2 text-lg font-semibold"
                        style={{ color: "#00FF87" }}
                      >
                        {metric.projected}
                        {metric.suffix}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="panel">
          <p className="eyebrow font-[var(--font-display)] uppercase tracking-[0.18em]">
            Transfer window
          </p>
          <div className="mt-5 space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="stat-card">
                <span>Projected finals DAU lift</span>
                <strong style={{ color: "#00FF87" }}>
                  +
                  {seasonSimulation.metrics.find(
                    (m) => m.label === "Daily return rate"
                  )?.projected ?? 0}
                  %
                </strong>
              </div>
              <div className="stat-card">
                <span>Projected comp volume mix</span>
                <strong style={{ color: "#00FF87" }}>
                  {seasonSimulation.metrics.find(
                    (m) => m.label === "Competition share of volume"
                  )?.projected ?? 0}
                  %
                </strong>
              </div>
            </div>

            <div className="rounded-[4px] border border-white/10 bg-black/20 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-white">
                  {currentCup.name} transfer window
                </p>
                <p
                  className="text-[11px] uppercase tracking-[0.16em] text-white/42"
                  style={{ fontFamily: "var(--font-mono)" }}
                >
                  between phases
                </p>
              </div>
              <div className="mt-4 space-y-3">
                {transferWindow.map((move) => (
                  <div
                    key={`${move.deskId}-${move.incoming}`}
                    className="rounded-[4px] border border-white/10 bg-white/5 p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-white">
                          {move.type}: {move.incoming}
                        </p>
                        <p className="mt-2 text-sm leading-6 text-white/58">
                          {move.summary}
                        </p>
                      </div>
                      <p
                        className="text-xs text-white/44"
                        style={{ fontFamily: "var(--font-mono)" }}
                      >
                        {move.outgoing ? `for ${move.outgoing}` : "new slot"}
                      </p>
                    </div>
                    <p
                      className="mt-3 text-sm leading-6"
                      style={{ color: "rgba(0,255,135,0.78)" }}
                    >
                      {move.impact}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
