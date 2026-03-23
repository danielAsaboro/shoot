// Core
export type {
  Bar,
  Verdict,
  Exposure,
  Guardrails,
  Playbook,
  TradeParams,
  FlightPlan,
  OracleTapConfig,
  KeltnerEnvelope,
  MacdResult,
  StochResult,
} from "./core/types.js";
export { DEFAULT_GUARDRAILS } from "./core/types.js";
export {
  SHOOT_PROGRAM_ID,
  ADRENA_PROGRAM_ID,
  ADRENA_MAIN_POOL,
  PYTH_FEED_IDS,
} from "./core/constants.js";

// Telemetry
export {
  computeVWAP,
  computeATR,
  computeMACD,
  computeStochastic,
  computeKeltner,
} from "./indicators/index.js";

// Playbooks
export {
  TrendSurfer,
  FadeTrader,
  RangeSniper,
  FundingArb,
  GridRunner,
} from "./playbooks/index.js";
export type {
  TrendSurferConfig,
  FadeTraderConfig,
  RangeSniperConfig,
  FundingArbConfig,
  GridRunnerConfig,
} from "./playbooks/index.js";

// Cockpit
export { FlightController, RiskHarness } from "./cockpit/index.js";
export type { FlightControllerDeps } from "./cockpit/index.js";

// Feed
export { OracleTap, ReplayTap } from "./feed/index.js";

// On-chain
export { ShootProgram, deriveAgentPda, PerpBuilder } from "./onchain/index.js";
