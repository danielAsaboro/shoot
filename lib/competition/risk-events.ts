import type {
  ChallengeTierId,
  ChallengeModifier,
  RiskEvent,
  RiskEventId,
  RiskScenario,
  TraderPerformance,
} from "./types.ts";

// ── Seeded PRNG ──────────────────────────────────────────────────────────────

function createRiskRng(seed: number) {
  let s = seed | 0;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

function hashSeed(str: string): number {
  let hash = 7919;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

// ── Risk Event Catalog ───────────────────────────────────────────────────────

export const RISK_EVENT_CATALOG: Record<RiskEventId, Omit<RiskEvent, "triggeredAt">> = {
  flash_crash: {
    id: "flash_crash",
    label: "Flash Crash",
    description: "Sudden 15%+ market drop across correlated assets. Tests stop-loss discipline.",
    severity: "severe",
    affectedMetric: "pnlPercent",
    modifier: -0.35,
    affectedTiers: ["scout", "ranger", "veteran", "elite", "apex"],
    durationHours: 4,
  },
  liquidity_drain: {
    id: "liquidity_drain",
    label: "Liquidity Drain",
    description: "Order book thins out, spreads widen. Slippage increases on all entries and exits.",
    severity: "moderate",
    affectedMetric: "volumeUsd",
    modifier: -0.2,
    affectedTiers: ["veteran", "elite", "apex"],
    durationHours: 8,
  },
  volatility_spike: {
    id: "volatility_spike",
    label: "Volatility Spike",
    description: "Realized vol doubles. High-leverage positions face amplified P&L swings.",
    severity: "moderate",
    affectedMetric: "maxDrawdownPercent",
    modifier: 0.4,
    affectedTiers: ["scout", "ranger", "veteran", "elite", "apex"],
    durationHours: 6,
  },
  forced_market: {
    id: "forced_market",
    label: "Forced Market",
    description: "Traders must execute in a specific market for the window duration.",
    severity: "mild",
    affectedMetric: "consistencyScore",
    modifier: -0.15,
    affectedTiers: ["elite", "apex"],
    durationHours: 12,
  },
  correlation_break: {
    id: "correlation_break",
    label: "Correlation Break",
    description: "Historical correlations diverge. Multi-asset strategies face unexpected moves.",
    severity: "moderate",
    affectedMetric: "winRate",
    modifier: -0.12,
    affectedTiers: ["veteran", "elite", "apex"],
    durationHours: 10,
  },
  news_blackout: {
    id: "news_blackout",
    label: "News Blackout",
    description: "No economic calendar data. Traders must rely on price action alone.",
    severity: "mild",
    affectedMetric: "consistencyScore",
    modifier: -0.1,
    affectedTiers: ["scout", "ranger", "veteran"],
    durationHours: 24,
  },
  leverage_cap: {
    id: "leverage_cap",
    label: "Leverage Cap",
    description: "Maximum leverage reduced to 5x for the event duration.",
    severity: "mild",
    affectedMetric: "pnlPercent",
    modifier: -0.1,
    affectedTiers: ["scout", "ranger"],
    durationHours: 12,
  },
  spread_widening: {
    id: "spread_widening",
    label: "Spread Widening",
    description: "Bid-ask spreads increase 3x. Scalping strategies become unprofitable.",
    severity: "moderate",
    affectedMetric: "volumeUsd",
    modifier: -0.15,
    affectedTiers: ["scout", "ranger", "veteran", "elite", "apex"],
    durationHours: 6,
  },
};

// ── Scenario Generation ──────────────────────────────────────────────────────

const SCENARIO_LABELS = [
  "Black Monday Redux",
  "Liquidity Crunch",
  "Volatility Storm",
  "Market Stress Test",
  "Correlation Chaos",
  "Flash Event Window",
  "Spread Squeeze",
  "News Vacuum",
];

const SCENARIO_NARRATIVES = [
  "Markets tested with extreme conditions. Only disciplined traders survive.",
  "Liquidity evaporates across venues. Execution quality separates winners from losers.",
  "Volatility explodes — leverage is a double-edged sword today.",
  "A stress test for risk management. Drawdown control is everything.",
  "Correlations break down — diversification fails when you need it most.",
  "A sudden event window forces rapid decision-making under pressure.",
  "Spreads blow out. Cost-conscious traders have the edge.",
  "No data, no news. Pure price action trading only.",
];

export function generateRiskScenario(cohortId: string): RiskScenario {
  const rng = createRiskRng(hashSeed(`risk-${cohortId}`));
  const eventIds = Object.keys(RISK_EVENT_CATALOG) as RiskEventId[];

  // Pick 2-3 events per scenario
  const eventCount = 2 + Math.floor(rng() * 2);
  const selectedIds: RiskEventId[] = [];

  while (selectedIds.length < eventCount) {
    const idx = Math.floor(rng() * eventIds.length);
    const id = eventIds[idx];
    if (!selectedIds.includes(id)) {
      selectedIds.push(id);
    }
  }

  const baseTime = Date.now();
  const events: RiskEvent[] = selectedIds.map((id, i) => ({
    ...RISK_EVENT_CATALOG[id],
    triggeredAt: new Date(baseTime + i * 3600000 * 4).toISOString(),
  }));

  const labelIdx = Math.floor(rng() * SCENARIO_LABELS.length);
  const difficulty = Math.round(3 + rng() * 7);

  return {
    id: `scenario-${cohortId}`,
    label: SCENARIO_LABELS[labelIdx],
    events,
    narrative: SCENARIO_NARRATIVES[labelIdx],
    difficulty,
  };
}

// ── Modifier Application ─────────────────────────────────────────────────────

export function applyRiskEventModifiers(
  performance: TraderPerformance,
  events: RiskEvent[]
): TraderPerformance {
  const modified = { ...performance };

  for (const event of events) {
    const metric = event.affectedMetric;
    if (metric === "attainedAt") continue;

    const currentValue = modified[metric] ?? 0;
    const adjusted = Number(
      (currentValue * (1 + event.modifier)).toFixed(2)
    );

    if (metric === "pnlPercent") modified.pnlPercent = adjusted;
    else if (metric === "volumeUsd") modified.volumeUsd = adjusted;
    else if (metric === "winRate") modified.winRate = adjusted;
    else if (metric === "consistencyScore") modified.consistencyScore = adjusted;
    else if (metric === "maxDrawdownPercent") modified.maxDrawdownPercent = adjusted;
  }

  return modified;
}

// ── Active Event Filtering ───────────────────────────────────────────────────

export function getActiveRiskEvents(
  scenario: RiskScenario,
  currentTime: number = Date.now()
): RiskEvent[] {
  return scenario.events.filter((event) => {
    const start = new Date(event.triggeredAt).getTime();
    const end = start + event.durationHours * 3600000;
    return currentTime >= start && currentTime < end;
  });
}

// ── Challenge Modifiers ──────────────────────────────────────────────────────

export function getChallengeModifiers(
  tier: ChallengeTierId,
  activeEvents: RiskEvent[]
): ChallengeModifier[] {
  const modifiers: ChallengeModifier[] = [];

  for (const event of activeEvents) {
    if (event.affectedTiers.includes(tier)) {
      modifiers.push({
        type: event.id,
        value: event.modifier,
        reason: `${event.label}: ${event.description}`,
      });
    }
  }

  return modifiers;
}
