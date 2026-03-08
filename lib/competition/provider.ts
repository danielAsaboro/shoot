import { adrenaLiveAdapter } from "./adrena-live-adapter.ts";
import type {
  CompetitionIntegrationStatus,
  CompetitionSnapshotResponse,
} from "./types.ts";

export function getCompetitionIntegrationStatus(): CompetitionIntegrationStatus {
  const competitionApiBaseUrl =
    process.env.ADRENA_COMPETITION_API_BASE_URL;
  const dataApiBaseUrl =
    process.env.ADRENA_DATA_API_BASE_URL ?? "https://datapi.adrena.trade";
  const apiBaseUrl = competitionApiBaseUrl ?? dataApiBaseUrl;
  return {
    apiBaseUrl,
    configured: true,
    detail: competitionApiBaseUrl
      ? "Adrena provider active. Data is fetched from the Competition Service API."
      : "Adrena provider active. Position data is fetched from datapi.adrena.trade.",
    label: competitionApiBaseUrl ? "Adrena Competition Service" : "Adrena Data API",
    provider: "adrena",
  };
}

export async function getCompetitionSnapshotResponse(
  viewerWallet?: string,
  enrolledCohortId?: string | null
): Promise<CompetitionSnapshotResponse> {
  const integration = getCompetitionIntegrationStatus();
  const snapshot = await adrenaLiveAdapter.getSnapshot(
    viewerWallet,
    enrolledCohortId
  );
  return { integration, snapshot };
}
