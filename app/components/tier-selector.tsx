"use client";

import { useState } from "react";
import type { ChallengeTier, ChallengeTierId, SpecialistChallenge, SpecialistType } from "@/lib/competition/types";
import { challengeTiers, specialistChallenges } from "@/lib/competition/tiers";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Props {
  isAuthenticated: boolean;
  onSelectTier: (tierId: ChallengeTierId) => void;
  onSelectSpecialist?: (type: SpecialistType) => void;
  onLogin: () => void;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const tierOrder: ChallengeTierId[] = ["sprint", "scout", "ranger", "veteran", "elite", "apex"];

const tierColors: Record<ChallengeTierId, { bg: string; border: string; accent: string; text: string }> = {
  sprint: {
    bg: "rgba(0,240,255,0.03)",
    border: "rgba(0,240,255,0.19)",
    accent: "#00F0FF",
    text: "#66F7FF",
  },
  scout: {
    bg: "rgba(61,127,255,0.03)",
    border: "rgba(61,127,255,0.19)",
    accent: "#3D7FFF",
    text: "#7FADFF",
  },
  ranger: {
    bg: "rgba(0,255,135,0.03)",
    border: "rgba(0,255,135,0.19)",
    accent: "#00FF87",
    text: "#66FFAD",
  },
  veteran: {
    bg: "rgba(191,90,242,0.03)",
    border: "rgba(191,90,242,0.19)",
    accent: "#BF5AF2",
    text: "#D28DF7",
  },
  elite: {
    bg: "rgba(191,255,0,0.03)",
    border: "rgba(191,255,0,0.19)",
    accent: "#BFFF00",
    text: "#D4FF55",
  },
  apex: {
    bg: "rgba(255,61,61,0.03)",
    border: "rgba(255,61,61,0.19)",
    accent: "#FF3D3D",
    text: "#FF7A7A",
  },
};

const specialistColors: Record<SpecialistType, { letter: string; accent: string; label: string }> = {
  crypto: { letter: "B", accent: "#3D7FFF", label: "Crypto" },
  metals: { letter: "M", accent: "#BFFF00", label: "Metals" },
  energy: { letter: "E", accent: "#FF3D3D", label: "Energy" },
  forex: { letter: "F", accent: "#00FF87", label: "Forex" },
  multi_asset: { letter: "X", accent: "#BF5AF2", label: "Multi-Asset" },
};

const tierTaglines: Record<ChallengeTierId, string> = {
  sprint: "48-hour micro-challenge. Prove yourself fast with just $1 entry.",
  scout: "Start here. Learn prop challenge mechanics with minimal risk.",
  ranger: "Ready to step up. Higher target, more room to breathe.",
  veteran: "Tighter rules, higher discipline. For consistent traders.",
  elite: "Unlock Funded Trader status. 90-day fee rebate on pass.",
  apex: "Maximum stakes. 180-day Funded status, highest ADX rewards.",
};

const tierPassRates: Record<ChallengeTierId, string> = {
  sprint: "~45%",
  scout: "~35%",
  ranger: "~25%",
  veteran: "~18%",
  elite: "~10%",
  apex: "~5%",
};

const tierRewards: Record<ChallengeTierId, string> = {
  sprint: "200 ADX + badge",
  scout: "500 ADX + badge",
  ranger: "2,000 ADX + badge",
  veteran: "5,000 ADX + badge",
  elite: "15,000 ADX + 25 USDC + Funded status",
  apex: "40,000 ADX + 100 USDC + Funded status",
};

// ── Onboarding modal ──────────────────────────────────────────────────────────

function OnboardingModal({ onDismiss }: { onDismiss: () => void }) {
  const [step, setStep] = useState(0);

  const steps = [
    {
      title: "What is a Prop Challenge?",
      body: "A prop challenge is a structured trading test. You pay a small entry fee, receive a set of rules (profit target, max drawdown, daily loss limit), and trade normally on Adrena. Pass the rules within the time limit → earn rewards. Fail → retry at a discount.",
    },
    {
      title: "How scoring works",
      body: "Your P&L percentage (not absolute P&L) determines if you pass. A trader with $200 who makes 10% passes the same challenge as a trader with $200,000 who makes 10%. Capital size doesn't matter — your risk management does.",
    },
    {
      title: "Drawdown vs Daily Loss",
      body: "Max drawdown is measured from your high-water mark: if your equity ever drops 5% below its peak, you fail. Daily loss limit resets at UTC midnight: you can lose max 3% of your starting equity in any single day before your challenge suspends for the day.",
    },
    {
      title: "If you pass: Funded Trader",
      body: "Passing an Elite or Apex challenge grants Funded Trader status: a visible badge on the leaderboard, 10% trading fee rebate (in ADX) for 90 days, auto-qualification for World Cup events, and access to the Funded Traders Discord channel.",
    },
    {
      title: "Start with Scout",
      body: "First time? Start with Scout: 2 USDC entry, 7 days, 8% profit target, 5% max drawdown. ~35% of traders pass on their first attempt. Failed? Retry at 30% off within 48 hours.",
    },
  ];

  const current = steps[step];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div
        className="w-full max-w-md border border-white/15 bg-[#0a0a0a] p-6 shadow-2xl"
        style={{ borderRadius: "4px" }}
      >
        <div className="mb-5 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div
              className="flex h-8 w-8 items-center justify-center font-mono text-sm font-bold flex-shrink-0"
              style={{
                borderRadius: "2px",
                background: "rgba(0,240,255,0.08)",
                border: "1px solid rgba(0,240,255,0.2)",
                color: "#00F0FF",
              }}
            >
              {step + 1}
            </div>
            <div>
              <p className="font-display text-[10px] uppercase tracking-wider text-white/40">STEP {step + 1} OF {steps.length}</p>
              <h3 className="font-display text-base font-bold uppercase text-white">{current.title}</h3>
            </div>
          </div>
          <button onClick={onDismiss} className="text-white/30 hover:text-white/70 text-lg leading-none">×</button>
        </div>

        <p className="font-sans text-sm text-white/70 leading-relaxed mb-6">{current.body}</p>

        {/* Progress dots — sharp rectangles */}
        <div className="flex gap-1.5 justify-center mb-5">
          {steps.map((_, i) => (
            <div
              key={i}
              className="h-1.5 transition-all duration-300"
              style={{
                borderRadius: "2px",
                width: i === step ? 24 : 6,
                background: i === step ? "#00F0FF" : "rgba(255,255,255,0.2)",
              }}
            />
          ))}
        </div>

        <div className="flex gap-3">
          {step > 0 && (
            <button
              onClick={() => setStep(step - 1)}
              className="flex-1 border border-white/15 py-2.5 text-sm text-white/60 hover:text-white transition font-display uppercase tracking-wide"
              style={{ borderRadius: "2px" }}
            >
              Back
            </button>
          )}
          {step < steps.length - 1 ? (
            <button
              onClick={() => setStep(step + 1)}
              className="flex-1 py-2.5 text-sm font-semibold text-black transition font-display uppercase tracking-wide"
              style={{ borderRadius: "2px", background: "#00F0FF" }}
            >
              Next →
            </button>
          ) : (
            <button
              onClick={onDismiss}
              className="flex-1 py-2.5 text-sm font-semibold text-black transition font-display uppercase tracking-wide"
              style={{ borderRadius: "2px", background: "#00FF87" }}
            >
              Start Trading
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Entry confirm modal ───────────────────────────────────────────────────────

function EntryConfirmModal({
  tier,
  onConfirm,
  onCancel,
}: {
  tier: ChallengeTier;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const c = tierColors[tier.id];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div
        className="w-full max-w-sm border bg-[#0a0a0a] p-6 shadow-2xl"
        style={{ borderRadius: "4px", borderColor: c.border, boxShadow: `0 0 60px ${c.accent}22` }}
      >
        <h3 className="mb-1 font-display text-xl font-bold uppercase" style={{ color: c.text }}>{tier.name} Challenge</h3>
        <p className="mb-5 text-sm text-white/50">Confirm your entry. Rules are binding from the moment you pay.</p>

        <div
          className="mb-5 space-y-2 border border-white/8 bg-white/[0.03] p-4"
          style={{ borderRadius: "4px" }}
        >
          {[
            ["Entry fee", `$${tier.entryFee.toFixed(2)} USDC`],
            ["Profit target", `+${tier.profitTarget}%`],
            ["Max drawdown", `−${tier.maxDrawdown}%`],
            ["Daily loss limit", `−${tier.dailyLossLimit}%`],
            ["Duration", `${tier.durationDays} days`],
            ["Funded eligible", tier.fundedEligible ? "Yes ✓" : "No"],
            ["Retry discount", `${tier.retryDiscount}% off within 48h`],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between text-sm">
              <span className="text-white/50 font-display uppercase text-xs tracking-wide">{k}</span>
              <span className="font-mono font-semibold text-white">{v}</span>
            </div>
          ))}
        </div>

        <div
          className="mb-5 border px-3 py-2 text-xs"
          style={{
            borderRadius: "2px",
            borderColor: "rgba(0,240,255,0.15)",
            background: "rgba(0,240,255,0.05)",
            color: "#66F7FF",
          }}
        >
          Fee split: 60% → prize pool · 25% → ADX buyback · 15% → consolation raffle
        </div>

        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 border border-white/15 py-2.5 text-sm text-white/60 hover:text-white transition font-display uppercase tracking-wide"
            style={{ borderRadius: "2px" }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 py-2.5 text-sm font-semibold text-black transition font-display uppercase tracking-wide"
            style={{ borderRadius: "2px", background: c.accent }}
          >
            Confirm & Pay
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Tier card ─────────────────────────────────────────────────────────────────

function TierCard({
  tier,
  isExpanded,
  onExpand,
  onSelect,
}: {
  tier: ChallengeTier;
  isExpanded: boolean;
  onExpand: () => void;
  onSelect: () => void;
}) {
  const c = tierColors[tier.id];
  const isFunded = tier.fundedEligible;

  return (
    <div
      className="border cursor-pointer transition-all duration-300 overflow-hidden"
      style={{
        borderRadius: "4px",
        background: isExpanded ? c.bg : "rgba(255,255,255,0.02)",
        borderColor: isExpanded ? c.border : "rgba(255,255,255,0.08)",
        borderTopWidth: isExpanded ? "4px" : "1px",
        borderTopColor: isExpanded ? c.accent : undefined,
        boxShadow: isExpanded ? `0 -8px 30px ${c.accent}12, 0 0 30px ${c.accent}08` : "none",
      }}
      onClick={onExpand}
    >
      {/* Tier header */}
      <div className="flex items-center justify-between px-4 py-3.5">
        <div className="flex items-center gap-3">
          <div
            className="flex h-8 w-8 items-center justify-center text-xs font-bold font-display uppercase"
            style={{
              borderRadius: "2px",
              background: `${c.accent}22`,
              color: c.accent,
              border: `1px solid ${c.border}`,
            }}
          >
            {tier.name[0]}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-display font-bold text-white uppercase tracking-wide">{tier.name}</span>
              {isFunded && (
                <span
                  className="px-2 py-0.5 text-[10px] font-bold font-display uppercase tracking-wider"
                  style={{
                    borderRadius: "2px",
                    background: "rgba(0,240,255,0.08)",
                    color: "#00F0FF",
                    border: "1px solid rgba(0,240,255,0.25)",
                  }}
                >
                  FUNDED
                </span>
              )}
            </div>
            <p className="text-xs text-white/40">{tierTaglines[tier.id]}</p>
          </div>
        </div>
        <div className="flex items-center gap-4 text-right">
          <div>
            <p className="font-display text-[10px] text-white/30 uppercase tracking-wider">Fee</p>
            <p className="font-mono text-sm font-bold" style={{ color: c.text }}>${tier.entryFee}</p>
          </div>
          <div>
            <p className="font-display text-[10px] text-white/30 uppercase tracking-wider">Target</p>
            <p className="font-mono text-sm font-bold" style={{ color: "#00FF87" }}>+{tier.profitTarget}%</p>
          </div>
          <svg
            width="16" height="16" viewBox="0 0 16 16" fill="none"
            className="text-white/30 transition-transform duration-300"
            style={{ transform: isExpanded ? "rotate(180deg)" : "none" }}
          >
            <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </div>
      </div>

      {/* Expanded details */}
      {isExpanded && (
        <div className="border-t px-4 pb-4 pt-3" style={{ borderColor: c.border }}>
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm mb-4 sm:grid-cols-3">
            {[
              ["Max drawdown", `${tier.maxDrawdown}%`],
              ["Daily loss limit", `${tier.dailyLossLimit}%`],
              ["Duration", `${tier.durationDays} days`],
              ["Pass rate", tierPassRates[tier.id]],
              ["Retry discount", `${tier.retryDiscount}% off`],
              ["Rewards", tierRewards[tier.id]],
            ].map(([k, v]) => (
              <div key={k}>
                <p className="font-display text-[10px] text-white/30 uppercase tracking-wider">{k}</p>
                <p className="font-mono text-xs font-semibold text-white">{v}</p>
              </div>
            ))}
          </div>

          {/* Progress bar — sharp, 3px height */}
          <div className="mb-4">
            <div className="flex justify-between text-[10px] text-white/30 mb-1 font-display uppercase tracking-wider">
              <span>Historical pass rate</span>
              <span className="font-mono">{tierPassRates[tier.id]}</span>
            </div>
            <div className="h-[3px] w-full overflow-hidden bg-white/10" style={{ borderRadius: "0px" }}>
              <div
                className="h-full transition-all duration-700"
                style={{
                  borderRadius: "0px",
                  width: tierPassRates[tier.id],
                  background: `linear-gradient(90deg, ${c.accent}88, ${c.accent})`,
                }}
              />
            </div>
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onSelect(); }}
              className="flex-1 py-2.5 text-sm font-semibold text-black transition font-display uppercase tracking-wide"
              style={{ borderRadius: "2px", background: c.accent, opacity: 0.95 }}
            >
              Enter {tier.name} — ${tier.entryFee} USDC
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Specialist card ───────────────────────────────────────────────────────────

function SpecialistCard({
  type,
  challenge,
  onSelect,
}: {
  type: SpecialistType;
  challenge: SpecialistChallenge;
  onSelect: () => void;
}) {
  const info = specialistColors[type];

  return (
    <div
      className="border p-4 cursor-pointer transition-all duration-200 hover:border-opacity-50"
      style={{
        borderRadius: "4px",
        background: `${info.accent}08`,
        borderColor: `${info.accent}22`,
      }}
      onClick={onSelect}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <div
            className="flex h-7 w-7 items-center justify-center text-xs font-bold font-display"
            style={{
              borderRadius: "2px",
              background: `${info.accent}20`,
              color: info.accent,
              border: `1px solid ${info.accent}30`,
            }}
          >
            {info.letter}
          </div>
          <div>
            <p className="text-sm font-bold font-display uppercase tracking-wide text-white">{challenge.name}</p>
            <p className="text-xs text-white/40">{challenge.markets.join(", ")}</p>
          </div>
        </div>
        <div
          className="px-2 py-0.5 text-[10px] font-bold font-display uppercase"
          style={{
            borderRadius: "2px",
            background: `${info.accent}22`,
            color: info.accent,
          }}
        >
          {((challenge.bonusMultiplier - 1) * 100).toFixed(0)}% bonus
        </div>
      </div>
      <div className="flex gap-3 text-xs">
        <div>
          <p className="text-white/30 font-display uppercase tracking-wider">Entry</p>
          <p className="font-mono font-bold text-white">5 USDC</p>
        </div>
        <div>
          <p className="text-white/30 font-display uppercase tracking-wider">Duration</p>
          <p className="font-mono font-bold text-white">7 days</p>
        </div>
        <div>
          <p className="text-white/30 font-display uppercase tracking-wider">Trades required</p>
          <p className="font-mono font-bold text-white">Specialist only</p>
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function TierSelector({ isAuthenticated, onSelectTier, onLogin }: Props) {
  const [expandedTier, setExpandedTier] = useState<ChallengeTierId | null>("scout");
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [confirmTier, setConfirmTier] = useState<ChallengeTier | null>(null);

  const allTiers = tierOrder.map((id) => challengeTiers[id]);
  const allSpecialists = Object.entries(specialistChallenges) as [SpecialistType, SpecialistChallenge][];

  function handleSelectTier(tierId: ChallengeTierId) {
    if (!isAuthenticated) {
      onLogin();
      return;
    }
    setConfirmTier(challengeTiers[tierId]);
  }

  function handleConfirm() {
    if (!confirmTier) return;
    setConfirmTier(null);
    onSelectTier(confirmTier.id);
  }

  return (
    <>
      {showOnboarding && <OnboardingModal onDismiss={() => setShowOnboarding(false)} />}
      {confirmTier && (
        <EntryConfirmModal
          tier={confirmTier}
          onConfirm={handleConfirm}
          onCancel={() => setConfirmTier(null)}
        />
      )}

      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="section-title font-display uppercase tracking-wider">Challenge Tiers</h2>
          <button
            type="button"
            onClick={() => setShowOnboarding(true)}
            className="secondary-button text-xs font-display uppercase tracking-wide"
          >
            ? How it works
          </button>
        </div>

        {/* Tier cards */}
        <div className="space-y-2">
          {allTiers.map((tier) => (
            <TierCard
              key={tier.id}
              tier={tier}
              isExpanded={expandedTier === tier.id}
              onExpand={() => setExpandedTier(expandedTier === tier.id ? null : tier.id)}
              onSelect={() => handleSelectTier(tier.id)}
            />
          ))}
        </div>

        {/* Specialist challenges */}
        <div>
          <div className="mb-3 flex items-center gap-2">
            <h3 className="font-display text-sm font-bold uppercase tracking-wider text-white">Specialist Tracks</h3>
            <span
              className="px-2 py-0.5 text-[10px] font-semibold font-display uppercase tracking-wider"
              style={{
                borderRadius: "2px",
                background: "rgba(0,240,255,0.08)",
                color: "#00F0FF",
                border: "1px solid rgba(0,240,255,0.2)",
              }}
            >
              RWA Gateway
            </span>
          </div>
          <p className="mb-4 text-xs text-white/40">
            Trade specific asset classes. The hook for Adrena&apos;s RWA markets — once you trade Gold on-chain, the behavioral barrier is broken.
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {allSpecialists.map(([type, challenge]) => (
              <SpecialistCard
                key={type}
                type={type}
                challenge={challenge}
                onSelect={() => isAuthenticated ? setConfirmTier({
                  id: "scout", // specialist uses scout-level rules
                  name: challenge.name,
                  entryFee: 5,
                  profitTarget: 8,
                  maxDrawdown: 5,
                  dailyLossLimit: 3,
                  durationDays: 7,
                  fundedEligible: false,
                  retryDiscount: 30,
                  minCapital: 50,
                }) : onLogin()}
              />
            ))}
          </div>
        </div>

        {/* New user CTA */}
        {!isAuthenticated && (
          <div
            className="border p-4 text-center"
            style={{
              borderRadius: "4px",
              borderColor: "rgba(0,240,255,0.2)",
              background: "rgba(0,240,255,0.04)",
            }}
          >
            <p className="mb-3 text-sm" style={{ color: "#66F7FF" }}>Sign in to start your first challenge</p>
            <button
              type="button"
              onClick={onLogin}
              className="action-button mx-auto font-display uppercase tracking-wide"
            >
              Connect wallet & start Scout
            </button>
          </div>
        )}
      </div>
    </>
  );
}
