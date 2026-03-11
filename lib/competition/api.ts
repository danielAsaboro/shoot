import type { CompetitionSnapshotResponse } from "./types.ts";

export async function fetchCompetitionSnapshot(
  viewerWallet?: string,
  enrolledCohortId?: string | null
) {
  const params = new URLSearchParams();
  if (viewerWallet) {
    params.set("wallet", viewerWallet);
  }
  if (enrolledCohortId) {
    params.set("enrolledCohortId", enrolledCohortId);
  }

  const url = params.size
    ? `/api/competition/snapshot?${params.toString()}`
    : "/api/competition/snapshot";
  const response = await fetch(url, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Snapshot request failed with ${response.status}.`);
  }

  return (await response.json()) as CompetitionSnapshotResponse;
}
