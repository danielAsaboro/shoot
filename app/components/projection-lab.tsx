"use client";

import { useState } from "react";
import { computeScoreBreakdown, computeRAROI } from "@/lib/competition/engine";
import type {
  CompetitionProjectionInput,
  StandingsEntry,
  ScoringMode,
} from "@/lib/competition/types";

function formatPercent(value: number) {
  return `${value.toFixed(1)}%`;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

const defaultInput: CompetitionProjectionInput = {
  pnlPercent: 16,
  volumeUsd: 175000,
  winRate: 58,
  consistencyScore: 84,
  maxDrawdownPercent: 4.6,
};

const SLIDER_CONFIG = [
  {
    key: "pnlPercent" as const,
    label: "PnL target",
    format: formatPercent,
    min: 4,
    max: 30,
    step: 0.5,
  },
  {
    key: "volumeUsd" as const,
    label: "Volume commitment",
    format: formatCurrency,
    min: 40000,
    max: 260000,
    step: 5000,
  },
  {
    key: "winRate" as const,
    label: "Win rate",
    format: formatPercent,
    min: 35,
    max: 80,
    step: 1,
  },
  {
    key: "consistencyScore" as const,
    label: "Consistency",
    format: (v: number) => String(v),
    min: 45,
    max: 98,
    step: 1,
  },
  {
    key: "maxDrawdownPercent" as const,
    label: "Max drawdown",
    format: formatPercent,
    min: 1,
    max: 12,
    step: 0.2,
  },
] as const;

interface ProjectionLabProps {
  standings: StandingsEntry[];
  initialInput?: CompetitionProjectionInput;
  onInputChange?: (input: CompetitionProjectionInput) => void;
  /** Cohort duration in days, used for RAROI activity factor. Default: 14. */
  cohortDays?: number;
}

interface BreakdownRow {
  label: string;
  value: number;
  /** Negative values are penalties (rendered in red). */
  isPenalty?: boolean;
}

function computeStandardBreakdown(input: CompetitionProjectionInput): {
  score: number;
  rows: BreakdownRow[];
} {
  const bd = computeScoreBreakdown({
    performance: {
      ...input,
      attainedAt: new Date().toISOString(),
    },
  });
  return {
    score: bd.totalScore,
    rows: [
      { label: "PnL", value: bd.pnlContribution },
      { label: "Volume", value: bd.volumeContribution },
      { label: "Consistency", value: bd.consistencyContribution },
      { label: "Win rate", value: bd.winRateContribution },
      { label: "Drawdown", value: -bd.drawdownPenalty, isPenalty: true },
    ],
  };
}

function computeRaroiBreakdown(
  input: CompetitionProjectionInput,
  totalDays: number
): { score: number; rows: BreakdownRow[] } {
  const roi = input.pnlPercent;
  const winRateFactor = Math.min(2, 0.5 + (input.winRate / 100) * 1.5);
  // Approximate active days from consistency score (0-100 → fraction of total)
  const activeDays = Math.round((input.consistencyScore / 100) * totalDays);
  const activityFactor = Math.min(1.5, 0.5 + activeDays / totalDays);
  const drawdownPenalty = input.maxDrawdownPercent * 0.3;

  const score = computeRAROI({
    pnlPercent: roi,
    winRate: input.winRate,
    activeDays,
    totalDays,
    maxDrawdownPercent: input.maxDrawdownPercent,
  });

  return {
    score,
    rows: [
      { label: "ROI base", value: Number(roi.toFixed(2)) },
      {
        label: `Win rate factor`,
        value: Number((roi * winRateFactor - roi).toFixed(2)),
      },
      {
        label: `Activity factor`,
        value: Number(
          (roi * winRateFactor * activityFactor - roi * winRateFactor).toFixed(2)
        ),
      },
      {
        label: "Drawdown penalty",
        value: Number((-drawdownPenalty).toFixed(2)),
        isPenalty: true,
      },
    ],
  };
}

function ContributionBar({
  row,
  maxAbsValue,
}: {
  row: BreakdownRow;
  maxAbsValue: number;
}) {
  const widthPercent = maxAbsValue > 0 ? (Math.abs(row.value) / maxAbsValue) * 100 : 0;
  const color = row.isPenalty ? "#FF3D3D" : "#00F0FF";

  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="w-28 shrink-0 text-white/58">{row.label}</span>
      <div className="flex-1 h-4 rounded-sm overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
        <div
          className="h-full rounded-sm transition-all duration-200"
          style={{
            width: `${Math.min(100, widthPercent)}%`,
            background: color,
            opacity: 0.85,
          }}
        />
      </div>
      <span
        className="w-16 text-right font-mono text-xs"
        style={{ color }}
      >
        {row.isPenalty ? "" : "+"}{row.value.toFixed(1)}
      </span>
    </div>
  );
}

export function ProjectionLab({
  standings,
  initialInput,
  onInputChange,
  cohortDays = 14,
}: ProjectionLabProps) {
  const [input, setInput] = useState<CompetitionProjectionInput>(
    initialInput ?? defaultInput
  );
  const [mode, setMode] = useState<ScoringMode>("standard");

  function updateInput(key: keyof CompetitionProjectionInput, value: number) {
    setInput((curr) => {
      const next = { ...curr, [key]: value };
      onInputChange?.(next);
      return next;
    });
  }

  const { score, rows } =
    mode === "raroi"
      ? computeRaroiBreakdown(input, cohortDays)
      : computeStandardBreakdown(input);

  const maxAbsValue = Math.max(...rows.map((r) => Math.abs(r.value)), 1);

  const projectedRank =
    (standings?.filter((s) => s.tournamentScore > score).length ?? 0) + 1;

  return (
    <aside className="panel">
      <div className="flex items-center justify-between mb-4">
        <h2 className="section-title">Projection Lab</h2>
        <div
          className="flex rounded-sm overflow-hidden text-xs font-semibold"
          style={{ border: "1px solid rgba(255,255,255,0.12)" }}
        >
          <button
            onClick={() => setMode("standard")}
            className="px-3 py-1 transition-colors"
            style={{
              background:
                mode === "standard" ? "rgba(0,240,255,0.15)" : "transparent",
              color: mode === "standard" ? "#00F0FF" : "rgba(255,255,255,0.45)",
            }}
          >
            Standard
          </button>
          <button
            onClick={() => setMode("raroi")}
            className="px-3 py-1 transition-colors"
            style={{
              background:
                mode === "raroi" ? "rgba(191,90,242,0.15)" : "transparent",
              color: mode === "raroi" ? "#BF5AF2" : "rgba(255,255,255,0.45)",
              borderLeft: "1px solid rgba(255,255,255,0.12)",
            }}
          >
            RAROI
          </button>
        </div>
      </div>

      {/* Sliders */}
      <div className="grid gap-4">
        {SLIDER_CONFIG.map(({ key, label, format, min, max, step }) => (
          <label key={key} className="slider-field">
            <div className="metric-line">
              <span>{label}</span>
              <strong>{format(input[key])}</strong>
            </div>
            <input
              type="range"
              min={min}
              max={max}
              step={step}
              value={input[key]}
              onChange={(e) => updateInput(key, Number(e.target.value))}
            />
          </label>
        ))}
      </div>

      <div className="divider" />

      {/* Score + rank */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="stat-card">
          <span>Projected rank</span>
          <strong>#{projectedRank}</strong>
        </div>
        <div className="stat-card">
          <span>
            {mode === "raroi" ? "RAROI score" : "Projected score"}
          </span>
          <strong
            style={{
              color: mode === "raroi" ? "#BF5AF2" : "var(--success)",
            }}
          >
            {score.toFixed(1)}
          </strong>
        </div>
      </div>

      {/* Contribution bars */}
      <div className="grid gap-2 mt-4">
        {rows.map((row) => (
          <ContributionBar key={row.label} row={row} maxAbsValue={maxAbsValue} />
        ))}
      </div>

      {mode === "raroi" && (
        <p className="text-xs text-white/38 mt-3">
          RAROI = ROI × WinRate factor × Activity factor − Drawdown penalty.
          Multiplicative scoring rewards skill over capital.
        </p>
      )}
    </aside>
  );
}
