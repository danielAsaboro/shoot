// ─── Shared envelope ────────────────────────────────────────────────────────

interface ApiResponse<T> {
  success: boolean;
  error: string | null;
  data: T;
}

// ─── /position ───────────────────────────────────────────────────────────────

export interface AdrenaPosition {
  position_id: number;
  user_id: number;
  symbol: string;
  token_account_mint: string;
  side: "long" | "short";
  /** API returns "open", "close", or "liquidate". */
  status: "open" | "close" | "liquidate";
  pubkey: string;
  entry_price: number;
  exit_price: number | null;
  entry_size: number;
  /** null for open positions */
  pnl: number | null;
  entry_leverage: number;
  entry_date: string;
  exit_date: string | null;
  fees: number;
  collateral_amount: number;
}

// ─── /pool-high-level-stats ──────────────────────────────────────────────────

export interface AdrenaPoolStats {
  start_date: string;
  end_date: string;
  daily_volume_usd: number;
  total_volume_usd: number;
  daily_fee_usd: number;
  total_fee_usd: number;
  pool_name: string;
}

// ─── /liquidity-info ─────────────────────────────────────────────────────────

export interface AdrenaCustody {
  symbol: string;
  mint: string;
  currentRatio: number;
  targetRatio: number;
  utilization: number;
  aumUsd: number;
  liquidityUsd: number;
}

export interface AdrenaLiquidityInfo {
  totalPoolValueUsd: number;
  custodies: AdrenaCustody[];
}

// ─── /apr ────────────────────────────────────────────────────────────────────

export interface AdrenaAprEntry {
  staking_type: "lm" | "alp";
  lock_period: number;
  apr: number;
  start_date: string;
  end_date: string;
}

export interface AdrenaAprData {
  start_date: string;
  end_date: string;
  aprs: AdrenaAprEntry[];
}

// ─── Trading quotes ──────────────────────────────────────────────────────────

export interface AdrenaLiquidityQuote {
  inputAmount: number;
  inputToken: string;
  outputAmount: number;
  outputToken: string;
  fee: number;
}

export interface AdrenaOpenPositionQuote {
  collateralAmount: number;
  collateralToken: string;
  token: string;
  leverage: number;
  size: number;
  entryPrice: number;
  liquidationPrice: number;
  fee: number;
  takeProfit?: number;
  stopLoss?: number;
}

export interface AdrenaClosePositionQuote {
  collateralAmount: number;
  collateralToken: string;
  token: string;
  percentage: number;
}

export interface AdrenaLimitOrderQuote {
  collateralAmount: number;
  collateralToken: string;
  token: string;
  leverage: number;
  triggerPrice: number;
  limitPrice?: number;
}

export interface AdrenaTradingPayload<Q> {
  quote: Q;
  /** Base64-encoded serialised transaction; must be signed and submitted by the caller. */
  transaction: string;
}

// ─── Competition Service Client ──────────────────────────────────────────

export interface SizeMultiplierTier {
  minSize: number;
  maxSize: number;
  multiplierMin: number;
  multiplierMax: number;
}

export interface SizeMultiplierResult {
  sizeUsd: number;
  multiplier: number;
  tier: SizeMultiplierTier;
}

function getCompetitionServiceBaseUrl(): string {
  const host =
    process.env.ADRENA_WS_HOST ?? "adrena-competition-service.onrender.com";
  const key = process.env.ADRENA_API_KEY;
  if (!key) throw new Error("ADRENA_API_KEY is not set");
  return `https://${host}/${key}`;
}

/** Fetch the full size multiplier lookup table from the competition service. */
export async function fetchSizeMultiplierTable(): Promise<
  SizeMultiplierTier[]
> {
  const base = getCompetitionServiceBaseUrl();
  const res = await fetch(`${base}/size-multiplier`);
  if (!res.ok)
    throw new Error(`Size multiplier table fetch failed: ${res.status}`);
  return res.json() as Promise<SizeMultiplierTier[]>;
}

/** Calculate size multiplier for a specific USD amount via the competition service. */
export async function calculateSizeMultiplier(
  sizeUsd: number
): Promise<SizeMultiplierResult> {
  const base = getCompetitionServiceBaseUrl();
  const res = await fetch(`${base}/size-multiplier/calculate?size=${sizeUsd}`);
  if (!res.ok)
    throw new Error(`Size multiplier calculation failed: ${res.status}`);
  return res.json() as Promise<SizeMultiplierResult>;
}

/** Health check for the competition service. */
export async function fetchCompetitionServiceHealth(): Promise<{
  status: string;
  timestamp: number;
}> {
  const base = getCompetitionServiceBaseUrl();
  const res = await fetch(`${base}/health`);
  if (!res.ok)
    throw new Error(`Competition service health check failed: ${res.status}`);
  return res.json() as Promise<{ status: string; timestamp: number }>;
}

// ─── Data API Client ────────────────────────────────────────────────────────

function getBaseUrl(): string {
  return process.env.ADRENA_DATA_API_BASE_URL ?? "https://datapi.adrena.trade";
}

async function get<T>(path: string, revalidate = 60): Promise<T> {
  const response = await fetch(`${getBaseUrl()}${path}`, {
    next: { revalidate },
  });
  if (!response.ok) {
    throw new Error(`Adrena API ${path} failed with ${response.status}`);
  }
  const payload = (await response.json()) as ApiResponse<T>;
  return payload.data;
}

/** Fetch historical and open positions for a wallet. */
export function fetchPositions(
  wallet: string,
  limit = 500
): Promise<AdrenaPosition[]> {
  return get<AdrenaPosition[]>(
    `/position?user_wallet=${encodeURIComponent(wallet)}&limit=${limit}`
  );
}

/** Aggregated daily + cumulative pool statistics. */
export function fetchPoolStats(
  params: { end_date?: string; pool_name?: string } = {}
): Promise<AdrenaPoolStats> {
  const qs = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== undefined) as [
      string,
      string,
    ][]
  ).toString();
  return get<AdrenaPoolStats>(`/pool-high-level-stats${qs ? `?${qs}` : ""}`);
}

/** Real-time per-custody liquidity breakdown. Cached server-side for 60 s. */
export function fetchLiquidityInfo(): Promise<AdrenaLiquidityInfo> {
  return get<AdrenaLiquidityInfo>("/liquidity-info");
}

/** APR data for ALP staking, optionally filtered by type / lock period / date range. */
export function fetchApr(
  params: {
    staking_type?: "lm" | "alp";
    lock_period?: number;
    start_date?: string;
    end_date?: string;
    get_average?: boolean;
  } = {}
): Promise<AdrenaAprData> {
  const qs = new URLSearchParams(
    Object.entries(params)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => [k, String(v)])
  ).toString();
  return get<AdrenaAprData>(`/apr${qs ? `?${qs}` : ""}`);
}

/** Generate an add-liquidity quote + unsigned transaction. */
export function fetchAddLiquidity(params: {
  account: string;
  amount: number;
  tokenSymbol: string;
}): Promise<AdrenaTradingPayload<AdrenaLiquidityQuote>> {
  const qs = new URLSearchParams({
    account: params.account,
    amount: String(params.amount),
    tokenSymbol: params.tokenSymbol,
  }).toString();
  return get<AdrenaTradingPayload<AdrenaLiquidityQuote>>(
    `/add-liquidity?${qs}`,
    0
  );
}

/** Generate a remove-liquidity quote + unsigned transaction. */
export function fetchRemoveLiquidity(params: {
  account: string;
  amount: number;
  receivingTokenSymbol: string;
}): Promise<AdrenaTradingPayload<AdrenaLiquidityQuote>> {
  const qs = new URLSearchParams({
    account: params.account,
    amount: String(params.amount),
    receivingTokenSymbol: params.receivingTokenSymbol,
  }).toString();
  return get<AdrenaTradingPayload<AdrenaLiquidityQuote>>(
    `/remove-liquidity?${qs}`,
    0
  );
}

/** Generate an open-long quote + unsigned transaction. */
export function fetchOpenLong(params: {
  account: string;
  collateralAmount: number;
  collateralTokenSymbol: string;
  tokenSymbol: string;
  leverage: number;
  takeProfit?: number;
  stopLoss?: number;
}): Promise<AdrenaTradingPayload<AdrenaOpenPositionQuote>> {
  const qs = new URLSearchParams(
    Object.entries(params)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => [k, String(v)])
  ).toString();
  return get<AdrenaTradingPayload<AdrenaOpenPositionQuote>>(
    `/open-long?${qs}`,
    0
  );
}

/** Generate an open-short quote + unsigned transaction. */
export function fetchOpenShort(params: {
  account: string;
  collateralAmount: number;
  collateralTokenSymbol: string;
  tokenSymbol: string;
  leverage: number;
  takeProfit?: number;
  stopLoss?: number;
}): Promise<AdrenaTradingPayload<AdrenaOpenPositionQuote>> {
  const qs = new URLSearchParams(
    Object.entries(params)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => [k, String(v)])
  ).toString();
  return get<AdrenaTradingPayload<AdrenaOpenPositionQuote>>(
    `/open-short?${qs}`,
    0
  );
}

/** Generate a close-long quote + unsigned transaction. */
export function fetchCloseLong(params: {
  account: string;
  collateralTokenSymbol: string;
  tokenSymbol: string;
  percentage?: number;
}): Promise<AdrenaTradingPayload<AdrenaClosePositionQuote>> {
  const qs = new URLSearchParams(
    Object.entries(params)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => [k, String(v)])
  ).toString();
  return get<AdrenaTradingPayload<AdrenaClosePositionQuote>>(
    `/close-long?${qs}`,
    0
  );
}

/** Generate a close-short quote + unsigned transaction. */
export function fetchCloseShort(params: {
  account: string;
  collateralTokenSymbol: string;
  tokenSymbol: string;
  percentage?: number;
}): Promise<AdrenaTradingPayload<AdrenaClosePositionQuote>> {
  const qs = new URLSearchParams(
    Object.entries(params)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => [k, String(v)])
  ).toString();
  return get<AdrenaTradingPayload<AdrenaClosePositionQuote>>(
    `/close-short?${qs}`,
    0
  );
}

/** Generate an open-limit-long quote + unsigned transaction. */
export function fetchOpenLimitLong(params: {
  account: string;
  collateralTokenSymbol: string;
  tokenSymbol: string;
  collateralAmount: number;
  leverage: number;
  triggerPrice: number;
  limitPrice?: number;
}): Promise<AdrenaTradingPayload<AdrenaLimitOrderQuote>> {
  const qs = new URLSearchParams(
    Object.entries(params)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => [k, String(v)])
  ).toString();
  return get<AdrenaTradingPayload<AdrenaLimitOrderQuote>>(
    `/open-limit-long?${qs}`,
    0
  );
}

/** Generate an open-limit-short quote + unsigned transaction. */
export function fetchOpenLimitShort(params: {
  account: string;
  collateralTokenSymbol: string;
  tokenSymbol: string;
  collateralAmount: number;
  leverage: number;
  triggerPrice: number;
  limitPrice?: number;
}): Promise<AdrenaTradingPayload<AdrenaLimitOrderQuote>> {
  const qs = new URLSearchParams(
    Object.entries(params)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => [k, String(v)])
  ).toString();
  return get<AdrenaTradingPayload<AdrenaLimitOrderQuote>>(
    `/open-limit-short?${qs}`,
    0
  );
}
