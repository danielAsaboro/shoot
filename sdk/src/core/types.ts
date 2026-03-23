/** A single OHLCV price bar */
export interface Bar {
  ts: number;
  o: number;
  h: number;
  l: number;
  c: number;
  vol: number;
}

/** Decision output from a playbook */
export type Verdict =
  | { kind: "buy"; conviction: number; allocation: number }
  | { kind: "sell"; conviction: number; allocation: number }
  | { kind: "exit"; memo: string }
  | { kind: "pass" };

/** Active perpetual exposure */
export interface Exposure {
  direction: "long" | "short";
  entry: number;
  size: number;
  floatingPnl: number;
  openedAt: number;
}

/** Risk guardrails */
export interface Guardrails {
  ceilingLeverage: number;
  maxExposureFrac: number;
  cutLossPct: number;
  lockGainPct: number;
  pauseMs: number;
}

export const DEFAULT_GUARDRAILS: Guardrails = {
  ceilingLeverage: 5,
  maxExposureFrac: 0.25,
  cutLossPct: 0.03,
  lockGainPct: 0.06,
  pauseMs: 30_000,
};

export interface KeltnerEnvelope {
  upper: number[];
  basis: number[];
  lower: number[];
}

export interface MacdResult {
  line: number[];
  signal: number[];
  histogram: number[];
}

export interface StochResult {
  k: number[];
  d: number[];
}

export interface Playbook {
  readonly label: string;
  readonly summary: string;
  assess(bars: Bar[], exposure: Exposure | null): Verdict;
}

export interface TradeParams {
  market: string;
  collateralAmount: number;
  leverage: number;
  slippage?: number;
}

export interface OracleTapConfig {
  symbols: Record<string, string>;
  cadenceMs: number;
}

export interface FlightPlan {
  cadenceMs: number;
  symbol: string;
}
