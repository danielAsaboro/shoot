"use client";

import { useEffect, useRef, useState } from "react";
import type { ChallengeTier, ChallengeTierId } from "@/lib/competition/types";
import { evaluateChallenge, computeRAROI } from "@/lib/competition/engine";
import { generateEquityPath } from "@/lib/competition/equity-curve";
import { EquityDetailChart } from "./equity-detail-chart";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ActiveChallengeState {
  tierId: ChallengeTierId;
  tier: ChallengeTier;
  startedAt: number; // unix ms
  durationDays: number;
  startingEquity: number;
  currentEquity: number;
  highWaterMark: number;
  dailyLossBase: number; // equity at start of current UTC day
  tradeCount: number;
  activeDays: number;
  winningTrades: number;
  totalTrades: number;
  assetClass?: string; // for specialist challenges
  equityHistory?: number[]; // equity curve data points (capped at 200)
  tradeHistory?: Array<{ market: string; pnl: number }>; // simulated trades
  attemptNumber?: number; // retry tracking
}

interface Props {
  challenge: ActiveChallengeState;
  onClose: () => void;
  onPass: (tier: ChallengeTier) => void;
  onFail: (reason: string, tier: ChallengeTier) => void;
  onRetry?: (tier: ChallengeTier, discountedFee: number) => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function msToDeadline(startedAt: number, durationDays: number) {
  return startedAt + durationDays * 86_400_000;
}

function formatCountdown(ms: number) {
  if (ms <= 0) return "00:00:00";
  const totalSec = Math.floor(ms / 1000);
  const d = Math.floor(totalSec / 86400);
  const h = Math.floor((totalSec % 86400) / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (d > 0) return `${d}d ${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v));
}

function tierColor(id: ChallengeTierId) {
  const map: Record<ChallengeTierId, string> = {
    sprint: "#00F0FF",
    scout: "#3D7FFF",
    ranger: "#00FF87",
    veteran: "#BF5AF2",
    elite: "#BFFF00",
    apex: "#FF3D3D",
  };
  return map[id] ?? "#6b7280";
}

// ── Equity curve SVG ─────────────────────────────────────────────────────────

function EquityCurve({ points, startingEquity }: { points: number[]; startingEquity: number }) {
  const w = 480;
  const h = 80;
  if (points.length < 2) return null;

  const { path, startY, hwmY } = generateEquityPath(points, w, h);
  const lastPoint = points[points.length - 1];
  const isAbove = lastPoint >= startingEquity;

  return (
    <div className="border-b border-white/5 bg-[#050505] px-6 py-3">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] uppercase tracking-[0.15em] text-white/40" style={{ fontFamily: "var(--font-display)" }}>EQUITY CURVE</span>
        <span className="text-xs font-semibold" style={{ fontFamily: "var(--font-mono)", color: isAbove ? "#00FF87" : "#FF3D3D" }}>
          ${lastPoint.toFixed(0)}
        </span>
      </div>
      <svg width="100%" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="overflow-visible">
        {/* Start level line */}
        <line x1="0" y1={startY} x2={w} y2={startY} stroke="rgba(255,255,255,0.08)" strokeWidth="1" strokeDasharray="4 3" />
        {/* HWM dashed line */}
        <line x1="0" y1={hwmY} x2={w} y2={hwmY} stroke="rgba(0,240,255,0.3)" strokeWidth="1" strokeDasharray="3 4" />
        {/* Equity path */}
        <path
          d={path}
          fill="none"
          stroke={isAbove ? "#00FF87" : "#FF3D3D"}
          strokeWidth="2"
          strokeLinecap="square"
          strokeLinejoin="miter"
        />
      </svg>
    </div>
  );
}

// ── Gauge component ───────────────────────────────────────────────────────────

function RadialGauge({
  value,
  max,
  label,
  color,
  danger,
}: {
  value: number;
  max: number;
  label: string;
  color: string;
  danger?: boolean;
}) {
  const pct = clamp(value / max, 0, 1);
  const r = 36;
  const circ = 2 * Math.PI * r;
  const stroke = circ * (1 - pct);
  const isDanger = danger && pct > 0.7;
  const isAlarm = danger && pct > 0.9;

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative" style={{ width: 88, height: 88 }}>
        <svg width="88" height="88" viewBox="0 0 88 88" style={{ transform: "rotate(-90deg)" }}>
          {/* Track */}
          <circle cx="44" cy="44" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="8" />
          {/* Progress */}
          <circle
            cx="44"
            cy="44"
            r={r}
            fill="none"
            stroke={isAlarm ? "#FF3D3D" : isDanger ? "#BFFF00" : color}
            strokeWidth="8"
            strokeDasharray={`${circ} ${circ}`}
            strokeDashoffset={stroke}
            strokeLinecap="square"
            style={{
              transition: "stroke-dashoffset 0.6s ease, stroke 0.3s ease",
              filter: isAlarm ? "drop-shadow(0 0 6px #FF3D3D88)" : undefined,
            }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            className="text-base font-bold leading-none"
            style={{
              fontFamily: "var(--font-mono)",
              color: isAlarm ? "#FF3D3D" : isDanger ? "#BFFF00" : "white",
              animation: isAlarm ? "broadcast-blink 0.6s step-end infinite" : undefined,
            }}
          >
            {value.toFixed(1)}%
          </span>
        </div>
      </div>
      <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-white/50" style={{ fontFamily: "var(--font-display)" }}>{label}</span>
    </div>
  );
}

// ── Progress bar ──────────────────────────────────────────────────────────────

function ProgressBar({
  label,
  value,
  target,
  color,
  prefix = "",
  suffix = "",
}: {
  label: string;
  value: number;
  target: number;
  color: string;
  prefix?: string;
  suffix?: string;
}) {
  const pct = clamp(value / target, 0, 1) * 100;
  const done = value >= target;

  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-xs">
        <span className="text-white/60" style={{ fontFamily: "var(--font-display)", textTransform: "uppercase", letterSpacing: "0.1em" }}>{label}</span>
        <span className="font-semibold" style={{ fontFamily: "var(--font-mono)", color: done ? "#00FF87" : "white" }}>
          {prefix}{value.toFixed(1)}{suffix} / {prefix}{target}{suffix}
        </span>
      </div>
      <div className="h-[3px] w-full overflow-hidden bg-white/10" style={{ borderRadius: 0 }}>
        <div
          className="h-full transition-all duration-700"
          style={{
            width: `${pct}%`,
            borderRadius: 0,
            background: done
              ? "linear-gradient(90deg, #00CC6A, #00FF87)"
              : color,
            boxShadow: done ? "0 0 8px #00FF8766" : undefined,
          }}
        />
      </div>
    </div>
  );
}

// ── Pass celebration modal ────────────────────────────────────────────────────

function PassModal({ tier, onClose }: { tier: ChallengeTier; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="relative max-w-sm w-full mx-4 border p-8 text-center shadow-2xl"
        style={{ borderRadius: "4px", borderColor: "rgba(0,255,135,0.4)", background: "#0a1a12", boxShadow: "0 0 60px #00FF87aa, 0 0 120px #00FF8744" }}>
        {/* Animated ring */}
        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center"
          style={{ borderRadius: "4px", background: "radial-gradient(circle, #00FF8722 0%, transparent 70%)", border: "2px solid #00FF87" }}>
          <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
            <path d="M8 20l8 8 16-16" stroke="#00FF87" strokeWidth="3" strokeLinecap="square" strokeLinejoin="miter"
              style={{ strokeDasharray: 40, strokeDashoffset: 0, animation: "draw 0.5s ease forwards" }} />
          </svg>
        </div>
        <h2 className="mb-1 text-2xl font-bold text-white" style={{ fontFamily: "var(--font-display)", textTransform: "uppercase", letterSpacing: "0.05em" }}>CHALLENGE PASSED</h2>
        <p className="mb-1 font-semibold" style={{ color: "#00FF87", fontFamily: "var(--font-display)", textTransform: "uppercase" }}>{tier.name} Complete</p>
        <p className="mb-6 text-sm text-white/50" style={{ fontFamily: "var(--font-sans)" }}>
          {tier.fundedEligible
            ? "You've unlocked Funded Trader status. Fee rebates and leaderboard prominence active."
            : "Badge unlocked. Retry a higher tier or begin your next challenge."}
        </p>
        <div className="mb-6 border px-4 py-3 text-left space-y-1" style={{ borderRadius: "4px", borderColor: "rgba(0,255,135,0.2)", background: "rgba(0,255,135,0.08)" }}>
          {tier.fundedEligible ? (
            <>
              <p className="text-xs" style={{ color: "#00FF87" }}>&#x2713; Funded Trader badge awarded</p>
              <p className="text-xs" style={{ color: "#00FF87" }}>&#x2713; 10% fee rebate for 90 days</p>
              <p className="text-xs" style={{ color: "#00FF87" }}>&#x2713; World Cup auto-qualification</p>
            </>
          ) : (
            <>
              <p className="text-xs" style={{ color: "#00FF87" }}>&#x2713; {tier.name} badge awarded</p>
              <p className="text-xs" style={{ color: "#00FF87" }}>&#x2713; Mutagen bonus credited</p>
            </>
          )}
        </div>
        <button
          onClick={onClose}
          className="w-full py-2.5 text-sm font-semibold transition hover:brightness-110"
          style={{ borderRadius: "2px", background: "#00FF87", color: "#050505", fontFamily: "var(--font-display)", textTransform: "uppercase", letterSpacing: "0.1em" }}
        >
          VIEW LEADERBOARD
        </button>
      </div>
    </div>
  );
}

// ── Fail modal ────────────────────────────────────────────────────────────────

function FailModal({
  reason,
  tier,
  onRetry,
  onClose,
}: {
  reason: string;
  tier: ChallengeTier;
  onRetry: () => void;
  onClose: () => void;
}) {
  const [retryCountdown, setRetryCountdown] = useState(48 * 3600);

  useEffect(() => {
    const t = setInterval(() => setRetryCountdown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(t);
  }, []);

  const discountFraction = tier.retryDiscount > 1 ? tier.retryDiscount / 100 : tier.retryDiscount;
  const discountedFee = (tier.entryFee * (1 - discountFraction)).toFixed(2);
  const h = Math.floor(retryCountdown / 3600);
  const m = Math.floor((retryCountdown % 3600) / 60);
  const s = retryCountdown % 60;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="relative max-w-sm w-full mx-4 border p-8 text-center shadow-2xl"
        style={{ borderRadius: "4px", borderColor: "rgba(255,61,61,0.3)", background: "#1a0808", boxShadow: "0 0 60px #FF3D3D44" }}>
        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center"
          style={{ borderRadius: "4px", border: "2px solid #FF3D3D", background: "radial-gradient(circle, #FF3D3D22 0%, transparent 70%)" }}>
          <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
            <path d="M10 10l16 16M26 10L10 26" stroke="#FF3D3D" strokeWidth="3" strokeLinecap="square" />
          </svg>
        </div>
        <h2 className="mb-1 text-2xl font-bold text-white" style={{ fontFamily: "var(--font-display)", textTransform: "uppercase", letterSpacing: "0.05em" }}>CHALLENGE FAILED</h2>
        <p className="mb-4 text-sm" style={{ color: "#FF3D3D" }}>{reason}</p>

        <div className="mb-5 border px-4 py-3 text-left" style={{ borderRadius: "4px", borderColor: "rgba(255,61,61,0.2)", background: "rgba(255,61,61,0.08)" }}>
          <p className="text-xs text-white/60 mb-2" style={{ fontFamily: "var(--font-display)", textTransform: "uppercase", letterSpacing: "0.1em" }}>Retry discount available for:</p>
          <p className="text-xl font-bold" style={{ fontFamily: "var(--font-mono)", color: "#FF3D3D" }}>
            {String(h).padStart(2, "0")}:{String(m).padStart(2, "0")}:{String(s).padStart(2, "0")}
          </p>
          <p className="mt-2 text-xs text-white/50">
            Re-enter {tier.name} for <span className="font-semibold" style={{ color: "#00F0FF" }}>${discountedFee}</span>{" "}
            (was ${tier.entryFee.toFixed(2)}, {Math.round(discountFraction * 100)}% off)
          </p>
        </div>

        <div className="flex gap-3">
          <button
            onClick={onRetry}
            className="flex-1 py-2.5 text-sm font-semibold transition hover:brightness-110"
            style={{ borderRadius: "2px", background: "#00F0FF", color: "#050505", fontFamily: "var(--font-display)", textTransform: "uppercase", letterSpacing: "0.1em" }}
          >
            RETRY ({Math.round(discountFraction * 100)}% OFF)
          </button>
          <button
            onClick={onClose}
            className="flex-1 border border-white/20 py-2.5 text-sm font-semibold text-white/70 transition hover:border-white/40"
            style={{ borderRadius: "2px", fontFamily: "var(--font-display)", textTransform: "uppercase", letterSpacing: "0.1em" }}
          >
            EXIT
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function ActiveChallenge({ challenge, onClose, onPass, onFail, onRetry }: Props) {
  const { tier, startedAt, durationDays } = challenge;
  const deadline = msToDeadline(startedAt, durationDays);

  const [now, setNow] = useState(() => Date.now());
  const [passModal, setPassModal] = useState(false);
  const [failModal, setFailModal] = useState<{ reason: string } | null>(null);
  const [simState, setSimState] = useState(challenge);
  const tickRef = useRef(0);
  // Track whether the challenge has been finalized (pass/fail) to prevent re-evaluation
  const finalizedRef = useRef(false);
  // Keep a ref to latest simState so the interval can read it without stale closure
  const simStateRef = useRef(simState);

  // Keep simStateRef in sync inside an effect (correct pattern — not during render)
  useEffect(() => {
    simStateRef.current = simState;
  }, [simState]);

  // Live countdown
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Poll real positions from Adrena and compute challenge metrics
  useEffect(() => {
    async function fetchAndEvaluate() {
      if (finalizedRef.current) return;

      const prev = simStateRef.current;
      const wallet = prev.assetClass; // wallet address stored in assetClass field if available

      try {
        // Fetch real position metrics from the Adrena live endpoint
        const res = await fetch(`/api/adrena-live/positions?wallet=${wallet ?? ""}`);
        if (!res.ok) return;
        const data = await res.json();
        const metrics = data.metrics;

        if (!metrics) return;

        const newEquity = prev.startingEquity * (1 + (metrics.pnlPercent ?? 0) / 100);
        const newHWM = Math.max(prev.highWaterMark, newEquity);
        const newTradeCount = metrics.tradeCount ?? prev.tradeCount;
        const newWinningTrades = Math.round(newTradeCount * (metrics.winRate ?? 0) / 100);
        const elapsedDays = (Date.now() - startedAt) / 86_400_000;
        const newActiveDays = metrics.activeDays ?? Math.min(Math.ceil(elapsedDays), durationDays);

        // Track equity history (cap at 200 points)
        const prevHistory = prev.equityHistory ?? [prev.startingEquity];
        const newHistory = prevHistory.length >= 200
          ? [...prevHistory.slice(1), newEquity]
          : [...prevHistory, newEquity];

        const nextState: ActiveChallengeState = {
          ...prev,
          currentEquity: newEquity,
          highWaterMark: newHWM,
          tradeCount: newTradeCount,
          totalTrades: newTradeCount,
          winningTrades: newWinningTrades,
          activeDays: newActiveDays,
          equityHistory: newHistory,
        };

        setSimState(nextState);

        // Detect pass/fail from real metrics
        const pnlPct = metrics.pnlPercent ?? 0;
        const ddPct = metrics.maxDrawdownPercent ?? 0;
        const todayStr = new Date().toISOString().slice(0, 10);
        const todayPositions = (data.positions ?? []) as Array<{ pnl: number | null; exit_date: string | null }>;
        const todayLossUsd = todayPositions
          .filter((p) => p.exit_date?.slice(0, 10) === todayStr && (p.pnl ?? 0) < 0)
          .reduce((sum, p) => sum + Math.abs(p.pnl ?? 0), 0);
        const dailyLoss = prev.startingEquity > 0 ? (todayLossUsd / prev.startingEquity) * 100 : 0;
        const winRate = metrics.winRate ?? 0;

        if (ddPct > tier.maxDrawdown) {
          finalizedRef.current = true;
          setFailModal({ reason: `Drawdown ${ddPct.toFixed(1)}% exceeded ${tier.maxDrawdown}% limit.` });
          onFail(`Drawdown limit breached`, tier);
          return;
        }

        if (pnlPct >= tier.profitTarget && newTradeCount >= 5) {
          const perf = { pnlPercent: pnlPct, maxDrawdownPercent: ddPct, dailyLossPercent: dailyLoss, activeDays: newActiveDays, totalDays: Math.ceil(elapsedDays) || 1, winRate };
          const eval_ = evaluateChallenge(tier, perf);
          if (eval_.passed) {
            finalizedRef.current = true;
            setPassModal(true);
            onPass(tier);
          }
        }
      } catch {
        // Position fetch failed — retry on next poll
      }
    }

    // Poll every 15 seconds
    void fetchAndEvaluate();
    const interval = setInterval(fetchAndEvaluate, 15000);
    return () => clearInterval(interval);
  }, [startedAt, durationDays, tier, onFail, onPass]);

  // Derived values
  const pnlPct = ((simState.currentEquity - simState.startingEquity) / simState.startingEquity) * 100;
  const ddPct = Math.max(
    ((simState.highWaterMark - simState.currentEquity) / simState.highWaterMark) * 100,
    0
  );
  const dailyLoss = Math.max(
    ((simState.dailyLossBase - simState.currentEquity) / simState.dailyLossBase) * 100,
    0
  );
  const winRate = simState.totalTrades > 0
    ? (simState.winningTrades / simState.totalTrades) * 100
    : 0;
  const timeLeft = deadline - now;
  const isExpired = timeLeft <= 0;
  const pnlPositive = pnlPct >= 0;
  const color = tierColor(tier.id);
  const raroi = computeRAROI({
    pnlPercent: pnlPct,
    winRate,
    activeDays: simState.activeDays,
    totalDays: Math.ceil((now - startedAt) / 86_400_000) || 1,
    maxDrawdownPercent: ddPct,
  });

  // Time elapsed %
  const elapsedPct = clamp((now - startedAt) / (durationDays * 86_400_000), 0, 1);

  return (
    <>
      {/* Broadcast blink keyframes */}
      <style jsx global>{`
        @keyframes broadcast-blink {
          0%, 49% { opacity: 1; }
          50%, 100% { opacity: 0; }
        }
        @keyframes animate-live-blink {
          0%, 49% { opacity: 1; }
          50%, 100% { opacity: 0.2; }
        }
        @keyframes draw {
          from { stroke-dashoffset: 40; }
          to { stroke-dashoffset: 0; }
        }
      `}</style>

      {passModal && (
        <PassModal
          tier={tier}
          onClose={() => { setPassModal(false); onClose(); }}
        />
      )}
      {failModal && (
        <FailModal
          reason={failModal.reason}
          tier={tier}
          onRetry={() => {
            setFailModal(null);
            if (onRetry) {
              const discountFraction = tier.retryDiscount > 1 ? tier.retryDiscount / 100 : tier.retryDiscount;
              const discountedFee = Number((tier.entryFee * (1 - discountFraction)).toFixed(2));
              onRetry(tier, discountedFee);
            } else {
              onClose();
            }
          }}
          onClose={() => { setFailModal(null); onClose(); }}
        />
      )}

      <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/60 backdrop-blur-sm p-4">
        <div className="my-4 w-full max-w-2xl border border-white/15 bg-[#0a0a0a] shadow-2xl"
          style={{ borderRadius: "4px", boxShadow: `0 0 80px ${color}22` }}>

          {/* ── Header ── */}
          <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="px-2.5 py-1 text-xs font-bold uppercase tracking-[0.15em]"
                style={{ borderRadius: "2px", background: `${color}22`, color, border: `1px solid ${color}44`, fontFamily: "var(--font-display)" }}>
                {tier.name}
              </div>
              <div className="flex items-center gap-1.5">
                <span className="inline-block"
                  style={{
                    width: "6px",
                    height: "6px",
                    borderRadius: "2px",
                    background: "#FF3D3D",
                    animation: "animate-live-blink 1.5s step-end infinite",
                  }} />
                <span className="text-xs font-semibold" style={{ color: "#FF3D3D", fontFamily: "var(--font-display)", letterSpacing: "0.15em" }}>LIVE</span>
              </div>
              {challenge.attemptNumber && challenge.attemptNumber > 1 && (
                <span className="px-2 py-0.5 text-[10px] font-bold border"
                  style={{ borderRadius: "2px", background: "rgba(0,240,255,0.1)", color: "#00F0FF", borderColor: "rgba(0,240,255,0.3)", fontFamily: "var(--font-display)", letterSpacing: "0.1em" }}>
                  ATTEMPT #{challenge.attemptNumber}
                </span>
              )}
            </div>
            <button
              onClick={onClose}
              className="border border-white/10 px-3 py-1.5 text-xs text-white/50 transition hover:border-white/30 hover:text-white"
              style={{ borderRadius: "2px", fontFamily: "var(--font-display)", textTransform: "uppercase", letterSpacing: "0.1em" }}
            >
              MINIMIZE
            </button>
          </div>

          {/* ── Timer strip — BROADCAST COUNTDOWN ── */}
          <div className="border-b border-white/5 bg-[#050505] px-6 py-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] uppercase tracking-[0.15em] text-white/40" style={{ fontFamily: "var(--font-display)" }}>TIME REMAINING</p>
                <p className="font-bold" style={{
                  fontFamily: "var(--font-display)",
                  fontSize: "3rem",
                  lineHeight: 1.1,
                  textTransform: "uppercase",
                  letterSpacing: "0.02em",
                  color: isExpired ? "#FF3D3D" : timeLeft < 3_600_000 ? "#BFFF00" : "white",
                }}>
                  {isExpired ? "EXPIRED" : formatCountdown(timeLeft)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[10px] uppercase tracking-[0.15em] text-white/40" style={{ fontFamily: "var(--font-display)" }}>RAROI</p>
                <p className="font-bold" style={{
                  fontFamily: "var(--font-display)",
                  fontSize: "3rem",
                  lineHeight: 1.1,
                  color: raroi >= 0 ? "#00FF87" : "#FF3D3D",
                }}>
                  {raroi >= 0 ? "+" : ""}{raroi.toFixed(1)}
                </p>
              </div>
            </div>
            {/* Duration bar */}
            <div className="mt-3 w-full overflow-hidden bg-white/10" style={{ height: "3px", borderRadius: 0 }}>
              <div
                className="h-full transition-all duration-1000"
                style={{
                  width: `${elapsedPct * 100}%`,
                  borderRadius: 0,
                  background: `linear-gradient(90deg, ${color}88, ${color})`,
                }}
              />
            </div>
            <div className="mt-1 flex justify-between text-[10px] text-white/30" style={{ fontFamily: "var(--font-mono)" }}>
              <span>Day {Math.ceil(elapsedPct * durationDays) || 1}</span>
              <span>{durationDays} days</span>
            </div>
          </div>

          {/* ── Equity curve (detail chart) ── */}
          {simState.equityHistory && simState.equityHistory.length > 1 && (
            <div className="border-b border-white/5 bg-[#050505] px-6 py-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] uppercase tracking-[0.15em] text-white/40" style={{ fontFamily: "var(--font-display)" }}>EQUITY CURVE</span>
                <span className="text-xs font-semibold" style={{
                  fontFamily: "var(--font-mono)",
                  color: (simState.equityHistory[simState.equityHistory.length - 1] ?? 0) >= simState.startingEquity ? "#00FF87" : "#FF3D3D",
                }}>
                  ${(simState.equityHistory[simState.equityHistory.length - 1] ?? 0).toFixed(0)}
                </span>
              </div>
              <EquityDetailChart
                points={simState.equityHistory}
                highWaterMark={simState.highWaterMark}
                startingEquity={simState.startingEquity}
                width={480}
                height={120}
              />
            </div>
          )}

          {/* ── Main gauges ── */}
          <div className="grid grid-cols-3 gap-4 border-b border-white/5 px-6 py-6">
            <RadialGauge
              value={Math.abs(pnlPct)}
              max={Math.max(tier.profitTarget * 1.5, 20)}
              label={pnlPct >= 0 ? "P&L +" : "P&L −"}
              color={pnlPositive ? "#00FF87" : "#FF3D3D"}
            />
            <RadialGauge
              value={ddPct}
              max={tier.maxDrawdown * 1.3}
              label="Drawdown"
              color="#BFFF00"
              danger
            />
            <RadialGauge
              value={dailyLoss}
              max={tier.dailyLossLimit * 1.3}
              label="Daily Loss"
              color="#00F0FF"
              danger
            />
          </div>

          {/* ── Progress bars ── */}
          <div className="space-y-4 border-b border-white/5 px-6 py-5">
            <ProgressBar
              label="Profit Target"
              value={Math.max(pnlPct, 0)}
              target={tier.profitTarget}
              color={`linear-gradient(90deg, ${color}88, ${color})`}
              suffix="%"
            />
            <ProgressBar
              label="Min Trades (5 Required)"
              value={simState.tradeCount}
              target={5}
              color="linear-gradient(90deg, #3D7FFF88, #3D7FFF)"
            />
          </div>

          {/* ── Stats grid ── */}
          <div className="grid grid-cols-2 gap-px bg-white/5 sm:grid-cols-4">
            {[
              {
                label: "Win Rate",
                value: `${winRate.toFixed(0)}%`,
                good: winRate > 50,
              },
              {
                label: "Active Days",
                value: `${simState.activeDays} / ${durationDays}`,
                good: simState.activeDays >= Math.floor(durationDays / 2),
              },
              {
                label: "Trades",
                value: String(simState.tradeCount),
                good: simState.tradeCount >= 5,
              },
              {
                label: "Equity",
                value: `$${simState.currentEquity.toFixed(0)}`,
                good: simState.currentEquity > simState.startingEquity,
              },
            ].map((stat) => (
              <div key={stat.label} className="bg-[#0a0a0a] px-4 py-4">
                <p className="text-[10px] uppercase tracking-[0.15em] text-white/40" style={{ fontFamily: "var(--font-display)" }}>{stat.label}</p>
                <p className={`mt-1 text-xl font-bold ${stat.good ? "text-white" : "text-white/60"}`} style={{ fontFamily: "var(--font-mono)" }}>
                  {stat.value}
                </p>
              </div>
            ))}
          </div>

          {/* ── Rules strip ── */}
          <div className="grid grid-cols-3 gap-3 border-t border-white/5 bg-[#050505] px-6 py-4 text-center">
            <div>
              <p className="text-[10px] uppercase tracking-[0.15em] text-white/30" style={{ fontFamily: "var(--font-display)" }}>TARGET</p>
              <p className="text-sm font-bold" style={{ fontFamily: "var(--font-mono)", color: "#00FF87" }}>+{tier.profitTarget}%</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.15em] text-white/30" style={{ fontFamily: "var(--font-display)" }}>MAX DD</p>
              <p className="text-sm font-bold" style={{ fontFamily: "var(--font-mono)", color: ddPct > tier.maxDrawdown * 0.8 ? "#FF3D3D" : "rgba(255,255,255,0.7)" }}>
                {tier.maxDrawdown}%
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.15em] text-white/30" style={{ fontFamily: "var(--font-display)" }}>DAILY LIMIT</p>
              <p className="text-sm font-bold" style={{ fontFamily: "var(--font-mono)", color: dailyLoss > tier.dailyLossLimit * 0.8 ? "#BFFF00" : "rgba(255,255,255,0.7)" }}>
                {tier.dailyLossLimit}%
              </p>
            </div>
          </div>

          {/* ── Specialist marker ── */}
          {challenge.assetClass && (
            <div className="border-t px-6 py-3 text-center text-xs"
              style={{ borderColor: "rgba(0,240,255,0.2)", background: "rgba(0,240,255,0.05)", color: "#00F0FF" }}>
              SPECIALIST: <strong>{challenge.assetClass}</strong> trades only. Other markets disqualify this challenge.
            </div>
          )}
        </div>
      </div>
    </>
  );
}
