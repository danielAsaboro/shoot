import {
  createCupLeaderboard,
  createDeskStandings,
  createFinalsBracket,
  createSeasonSimulation,
  createTransferWindow,
  createPayoutPreview,
  createFullBracket,
  findGoldenTrade,
  type WorldCupData,
} from "./engine.ts";
import { generateNarrativeBeats } from "./narrative.ts";
import {
  defaultWeights,
  defaultGuardrails,
  type AssetClassId,
  type ScenarioId,
  type ScoreWeights,
  type Guardrails,
  type MarketTwist,
} from "./types.ts";
import { loadWorldCupTraders, loadDesks } from "./data.ts";
import { loadLiveWorldCupData } from "./live-adapter.ts";

export type WorldCupMode = "simulation" | "live";

async function loadData(
  mode: WorldCupMode = "simulation"
): Promise<WorldCupData> {
  if (mode === "live") {
    return loadLiveWorldCupData();
  }
  const [traders, desks] = await Promise.all([
    loadWorldCupTraders(),
    loadDesks(),
  ]);
  return { traders, desks };
}

export type WorldCupIntegrationMode = "adrena";

export interface WorldCupIntegrationStatus {
  provider: WorldCupIntegrationMode;
  configured: boolean;
  label: string;
  detail: string;
}

export interface WorldCupSnapshotParams {
  cupId: AssetClassId;
  scenarioId: ScenarioId;
  weights: ScoreWeights;
  guardrails: Guardrails;
  walletAddress?: string;
  mode?: WorldCupMode;
}

export function getWorldCupIntegrationStatus(): WorldCupIntegrationStatus {
  return {
    provider: "adrena",
    configured: true,
    label: "Adrena Live",
    detail: "World Cup data is backed by live Adrena positions and PostgreSQL.",
  };
}

export async function getWorldCupSnapshot(params: WorldCupSnapshotParams) {
  const { cupId, scenarioId, weights, guardrails, walletAddress, mode } =
    params;
  const data = await loadData(mode);
  return {
    leaderboard: createCupLeaderboard({
      cupId,
      scenarioId,
      weights,
      guardrails,
      walletAddress,
      data,
    }),
    deskStandings: createDeskStandings({
      cupId,
      scenarioId,
      weights,
      guardrails,
      walletAddress,
      data,
    }),
    bracket: createFinalsBracket({
      scenarioId,
      weights,
      guardrails,
      walletAddress,
      data,
    }),
    simulation: createSeasonSimulation({ weights, guardrails }),
    transferWindow: createTransferWindow(cupId, data),
    payoutPreview: createPayoutPreview({
      cupId,
      scenarioId,
      weights,
      guardrails,
      walletAddress,
      data,
    }),
    mode: mode ?? "simulation",
  };
}

export async function getGroupStageSnapshot(
  params: WorldCupSnapshotParams & { twists?: MarketTwist[] }
) {
  const {
    cupId,
    scenarioId,
    weights,
    guardrails,
    walletAddress,
    mode,
    twists,
  } = params;
  const data = await loadData(mode);
  const fullBracket = createFullBracket({
    cupId,
    scenarioId,
    weights,
    guardrails,
    walletAddress,
    twists,
    data,
  });
  const goldenTrade = findGoldenTrade(fullBracket);
  const narrativeBeats = generateNarrativeBeats(fullBracket, goldenTrade);

  return {
    fullBracket,
    goldenTrade,
    narrativeBeats,
    mode: mode ?? "simulation",
  };
}

export async function getFullTournamentSnapshot(
  params: WorldCupSnapshotParams & { twists?: MarketTwist[] }
) {
  const [base, groupStage] = await Promise.all([
    getWorldCupSnapshot(params),
    getGroupStageSnapshot(params),
  ]);

  return {
    ...base,
    ...groupStage,
  };
}
