export async function fetchWorldCupSnapshot(params: {
  cupId: string;
  scenarioId: string;
  weights?: Record<string, number>;
  guardrails?: Record<string, number>;
  walletAddress?: string;
}) {
  const searchParams = new URLSearchParams();
  searchParams.set("cupId", params.cupId);
  searchParams.set("scenarioId", params.scenarioId);
  if (params.walletAddress) searchParams.set("wallet", params.walletAddress);
  if (params.weights)
    searchParams.set("weights", JSON.stringify(params.weights));
  if (params.guardrails)
    searchParams.set("guardrails", JSON.stringify(params.guardrails));

  const url = `/api/world-cup/snapshot?${searchParams.toString()}`;
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok)
    throw new Error(`World Cup snapshot failed: ${response.status}`);
  return response.json();
}

export async function fetchWorldCupLeaderboard(
  cupId: string,
  scenarioId: string
) {
  const url = `/api/world-cup/leaderboard?cupId=${cupId}&scenarioId=${scenarioId}`;
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok)
    throw new Error(`Leaderboard request failed: ${response.status}`);
  return response.json();
}

export async function fetchWorldCupBracket(scenarioId: string) {
  const url = `/api/world-cup/bracket?scenarioId=${scenarioId}`;
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok)
    throw new Error(`Bracket request failed: ${response.status}`);
  return response.json();
}

export async function postWorldCupSimulation(body: {
  weights: Record<string, number>;
  guardrails: Record<string, number>;
}) {
  const response = await fetch("/api/world-cup/simulation", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!response.ok)
    throw new Error(`Simulation request failed: ${response.status}`);
  return response.json();
}

export async function fetchWorldCupGroups(params: {
  cupId: string;
  scenarioId: string;
  weights?: Record<string, number>;
  guardrails?: Record<string, number>;
  walletAddress?: string;
}) {
  const searchParams = new URLSearchParams();
  searchParams.set("cupId", params.cupId);
  searchParams.set("scenarioId", params.scenarioId);
  if (params.walletAddress) searchParams.set("wallet", params.walletAddress);
  if (params.weights)
    searchParams.set("weights", JSON.stringify(params.weights));
  if (params.guardrails)
    searchParams.set("guardrails", JSON.stringify(params.guardrails));

  const url = `/api/world-cup/groups?${searchParams.toString()}`;
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok)
    throw new Error(`Groups request failed: ${response.status}`);
  return response.json();
}

export async function fetchFullTournament(params: {
  cupId: string;
  scenarioId: string;
  weights?: Record<string, number>;
  guardrails?: Record<string, number>;
  walletAddress?: string;
}) {
  const searchParams = new URLSearchParams();
  searchParams.set("cupId", params.cupId);
  searchParams.set("scenarioId", params.scenarioId);
  if (params.walletAddress) searchParams.set("wallet", params.walletAddress);
  if (params.weights)
    searchParams.set("weights", JSON.stringify(params.weights));
  if (params.guardrails)
    searchParams.set("guardrails", JSON.stringify(params.guardrails));

  const url = `/api/world-cup/groups?${searchParams.toString()}&full=true`;
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok)
    throw new Error(`Full tournament request failed: ${response.status}`);
  return response.json();
}
