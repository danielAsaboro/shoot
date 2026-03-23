"use client";

import { fundedDeskLadder } from "@/lib/competition/content";
import { fetchCompetitionSnapshot } from "@/lib/competition/api";
import {
  loadCompetitionReceipts,
  loadPersistedEnrollment,
} from "@/lib/competition/storage";
import type {
  CompetitionCohortView,
  CompetitionEntryReceipt,
  CompetitionProjectionInput,
  CompetitionSnapshotResponse,
} from "@/lib/competition/types";
import {
  useSafePrivy as usePrivy,
  useSafeWallets as useWallets,
  useSafeSignAndSendTransaction as useSignAndSendTransaction,
} from "@/app/hooks/use-safe-privy";
import bs58 from "bs58";
import {
  Connection,
  PublicKey,
  SystemProgram,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActiveChallenge, type ActiveChallengeState } from "./active-challenge";
import { TierSelector } from "./tier-selector";
import { GamificationPanel } from "./gamification-panel";
import { challengeTiers, specialistChallenges } from "@/lib/competition/tiers";
import type { ChallengeTierId, ChallengeTier } from "@/lib/competition/types";
import {
  CardSkeleton,
  LeaderboardSkeleton,
  WalletNotConnected,
} from "./error-boundary";
import { LeaderboardSection } from "./leaderboard-section";
import { QuestEngine } from "@/lib/competition/quests";
import { StreakTracker } from "@/lib/competition/streaks";
import { CompetitionMatchups } from "./competition-matchups";
import { CompetitionCommentary } from "./competition-commentary";
import { CompetitionFundedDesk } from "./competition-funded-desk";
import { ProjectionLab } from "./projection-lab";
import { FUNDED_LADDER } from "@/lib/competition/funded-ladder";
import { useCompetitionStream } from "../hooks/use-competition-stream";
import LiveTradeFeed from "./live-trade-feed";

import {
  SHOOT_PROGRAM_ID,
  findChallengePda,
  findVaultPda,
  buildEnrollInstruction,
  USDC_MINT_MAINNET,
  USDC_MINT_DEVNET,
} from "@/lib/solana/program";
import { getAssociatedTokenAddress } from "@solana/spl-token";

const DEVNET_RPC =
  process.env.NEXT_PUBLIC_SOLANA_RPC ??
  (process.env.NEXT_PUBLIC_SOLANA_CLUSTER === "mainnet"
    ? "https://api.mainnet-beta.solana.com"
    : "https://api.devnet.solana.com");
const PROGRAM_AUTHORITY = process.env.NEXT_PUBLIC_PROGRAM_AUTHORITY ?? "";
const lamportsPerSol = 1_000_000_000;

const defaultSimulationInput: CompetitionProjectionInput = {
  pnlPercent: 16,
  volumeUsd: 175000,
  winRate: 58,
  consistencyScore: 84,
  maxDrawdownPercent: 4.6,
};

// ── Formatters ────────────────────────────────────────────────────────────────

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatPercent(value: number) {
  return `${value.toFixed(1)}%`;
}

function formatSignedNumber(value: number) {
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}`;
}

function formatSol(value: number) {
  return `${value.toFixed(3)} SOL`;
}

function formatError(error: unknown) {
  if (error instanceof Error) return error.message;
  return String(error);
}

function getDevnetEntryFee(entryFeeUsd: number) {
  return Math.round(entryFeeUsd * 1_000_000);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function stateLabel(cohort: CompetitionCohortView) {
  if (cohort.state === "live") return "Live";
  if (cohort.state === "upcoming") return "Queued";
  return "Closed";
}

// ── Toast ─────────────────────────────────────────────────────────────────────

type ToastKind = "info" | "success" | "error";

interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

let toastCounter = 0;

/** Build a fresh ActiveChallengeState with default starting values. */
function makeInitialChallenge(
  tierId: ChallengeTierId,
  tier: ChallengeTier
): ActiveChallengeState {
  const startingEquity = 1000;
  return {
    tierId,
    tier,
    startedAt: Date.now(),
    durationDays: tier.durationDays,
    startingEquity,
    currentEquity: startingEquity,
    highWaterMark: startingEquity,
    dailyLossBase: startingEquity,
    tradeCount: 0,
    activeDays: 0,
    winningTrades: 0,
    totalTrades: 0,
  };
}

// ── Component ─────────────────────────────────────────────────────────────────

export function CompetitionHub() {
  const { authenticated, login } = usePrivy();
  const { wallets } = useWallets();
  const { signAndSendTransaction } = useSignAndSendTransaction();

  const solanaWallet = wallets[0] ?? null;
  const walletAddress = solanaWallet?.address ?? null;

  const [balance, setBalance] = useState<number | null>(null);
  const [balanceFetching, setBalanceFetching] = useState(false);
  const [selectedCohortId, setSelectedCohortId] = useState("");
  const [enrolledCohortId, setEnrolledCohortId] = useState<string | null>(null);
  const [snapshotResponse, setSnapshotResponse] =
    useState<CompetitionSnapshotResponse | null>(null);
  const [snapshotError, setSnapshotError] = useState<string | null>(null);
  const [isLoadingSnapshot, setIsLoadingSnapshot] = useState(true);
  const [receipts, setReceipts] = useState<CompetitionEntryReceipt[]>([]);
  const [simulationInput, setSimulationInput] = useState(
    defaultSimulationInput
  );
  const [isSendingEnrollment, setIsSendingEnrollment] = useState(false);
  const [isRequestingAirdrop, setIsRequestingAirdrop] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [activeChallenge, setActiveChallenge] =
    useState<ActiveChallengeState | null>(null);
  const [challengeAttempts, setChallengeAttempts] = useState<
    Record<string, number>
  >({});
  const [fundedExpiration, setFundedExpiration] = useState<string | null>(null);

  // Quest and streak engines — DB-backed, loaded from server API
  const questEngine = useMemo(
    () => new QuestEngine(walletAddress ?? undefined),
    [walletAddress]
  );
  const streakTracker = useMemo(
    () => new StreakTracker(walletAddress ?? undefined),
    [walletAddress]
  );
  const [liveQuestProgress, setLiveQuestProgress] = useState(() =>
    questEngine.getActiveQuests()
  );
  const [liveStreakDays, setLiveStreakDays] = useState(() =>
    streakTracker.getStreak()
  );
  const [liveStreakState, setLiveStreakState] = useState(() =>
    streakTracker.checkWarning()
  );

  // Load quest/streak state from server DB when wallet connects
  useEffect(() => {
    if (!walletAddress) return;
    let active = true;
    async function loadState() {
      await questEngine.loadFromDb();
      await streakTracker.loadFromDb();
      if (!active) return;
      setLiveQuestProgress(questEngine.getActiveQuests());
      setLiveStreakDays(streakTracker.getStreak());
      setLiveStreakState(streakTracker.checkWarning());
    }
    void loadState();
    return () => {
      active = false;
    };
  }, [walletAddress, questEngine, streakTracker]);
  const [earnedBadges, setEarnedBadges] = useState<string[]>([]);
  const [hasFailedChallenge, setHasFailedChallenge] = useState(false);

  // SSE real-time leaderboard updates
  const { connected: sseConnected, lastUpdate: sseLastUpdate } =
    useCompetitionStream(authenticated);

  // Live trade feed (populated from SSE events)
  const [recentTrades] = useState<
    {
      wallet: string;
      market: string;
      side: string;
      pnl: number;
      pnlPercent: number;
      closedAt: string;
    }[]
  >([]);

  // ── Toast helpers ────────────────────────────────────────────────────────

  function addToast(kind: ToastKind, message: string) {
    const id = ++toastCounter;
    setToasts((prev) => [...prev, { id, kind, message }]);
    setTimeout(
      () => setToasts((prev) => prev.filter((t) => t.id !== id)),
      kind === "error" ? 6000 : 4000
    );
  }

  // ── Balance fetch ────────────────────────────────────────────────────────

  const fetchBalance = useCallback(async (address: string) => {
    setBalanceFetching(true);
    try {
      const conn = new Connection(DEVNET_RPC, "confirmed");
      const lamports = await conn.getBalance(new PublicKey(address));
      setBalance(lamports);
    } catch {
      setBalance(null);
    } finally {
      setBalanceFetching(false);
    }
  }, []);

  useEffect(() => {
    if (!walletAddress) {
      setBalance(null);
      setReceipts([]);
      setEnrolledCohortId(null);
      return;
    }
    void fetchBalance(walletAddress);
    // Load enrollment and receipts from server DB
    void loadCompetitionReceipts(walletAddress).then(setReceipts);
    void loadPersistedEnrollment(walletAddress).then(setEnrolledCohortId);
  }, [walletAddress, fetchBalance]);

  // ── Snapshot ─────────────────────────────────────────────────────────────

  useEffect(() => {
    let isActive = true;

    async function loadSnapshot() {
      setIsLoadingSnapshot(true);
      try {
        const response = await fetchCompetitionSnapshot(
          walletAddress ?? undefined,
          enrolledCohortId
        );
        if (!isActive) return;
        setSnapshotResponse(response);
        setSnapshotError(null);
      } catch (error) {
        if (!isActive) return;
        setSnapshotError(formatError(error));
      } finally {
        if (isActive) setIsLoadingSnapshot(false);
      }
    }

    void loadSnapshot();
    return () => {
      isActive = false;
    };
  }, [walletAddress, enrolledCohortId]);

  const snapshot = snapshotResponse?.snapshot;

  useEffect(() => {
    if (!snapshot?.cohorts.length) return;
    const hasSelected = snapshot.cohorts.some((c) => c.id === selectedCohortId);
    if (!hasSelected) setSelectedCohortId(snapshot.cohorts[0].id);
  }, [selectedCohortId, snapshot]);

  if (!snapshot) {
    if (isLoadingSnapshot) {
      return (
        <div className="flex flex-col gap-6">
          {/* Hero skeleton */}
          <div className="hero-panel">
            <div className="h-3 w-28 rounded animate-pulse bg-white/10 mb-4" />
            <div className="h-12 w-64 rounded animate-pulse bg-white/10 mb-3" />
            <div className="h-4 w-80 rounded animate-pulse bg-white/8 mb-6" />
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[...Array(4)].map((_, i) => (
                <CardSkeleton key={i} lines={2} />
              ))}
            </div>
          </div>
          {/* Cohort cards skeleton */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[...Array(3)].map((_, i) => (
              <CardSkeleton key={i} lines={4} />
            ))}
          </div>
          {/* Leaderboard skeleton */}
          <div className="panel">
            <div className="h-3 w-32 rounded animate-pulse bg-white/10 mb-4" />
            <LeaderboardSkeleton />
          </div>
        </div>
      );
    }

    return (
      <section className="hero-panel">
        <p className="eyebrow">Competition data</p>
        <h1 className="hero-title text-[clamp(2.5rem,6vw,4.8rem)]">
          Snapshot unavailable
        </h1>
        <p className="hero-copy">
          {snapshotError ??
            "Could not load competition data. Check your connection and try again."}
        </p>
        <button
          type="button"
          className="action-button mt-6"
          onClick={() => window.location.reload()}
        >
          Retry
        </button>
      </section>
    );
  }

  const selectedCohort =
    snapshot.cohorts.find((c) => c.id === selectedCohortId) ??
    snapshot.cohorts[0];
  const latestReceipt = receipts[0] ?? null;
  const viewerQuestProgress = snapshot.viewer.questProgress;
  const viewerStreak = {
    streakDays: snapshot.viewer.streakDays,
    streakState: snapshot.viewer.streakState,
  };
  const viewerRaffleTickets = snapshot.viewer.raffleTickets;
  const selectedEntryFeeLamports = getDevnetEntryFee(
    selectedCohort.entryFeeUsd
  );
  const walletBalanceSol = balance !== null ? balance / lamportsPerSol : null;

  // ── Enrollment ───────────────────────────────────────────────────────────

  function handleQuickEnroll(cohortId: string) {
    if (!walletAddress) {
      addToast("info", "Sign in first to enroll.");
      return;
    }
    setSelectedCohortId(cohortId);
    setEnrolledCohortId(cohortId);
    addToast("success", "Enrollment set. Snapshot refreshing...");
  }

  async function handlePaidEnroll(cohortId: string) {
    if (!walletAddress || !solanaWallet) {
      addToast("info", "Sign in and connect a wallet to pay the entry fee.");
      return;
    }

    const cohort = snapshot?.cohorts.find((c) => c.id === cohortId);
    if (!cohort) return;

    setIsSendingEnrollment(true);
    addToast("info", `Sending entry payment for ${cohort.name}...`);

    try {
      const conn = new Connection(DEVNET_RPC, "confirmed");
      const traderKey = new PublicKey(walletAddress);

      // Derive PDAs for the on-chain enrollment
      const authorityKey = PROGRAM_AUTHORITY
        ? new PublicKey(PROGRAM_AUTHORITY)
        : traderKey; // fallback for dev
      const [challengePda] = findChallengePda(authorityKey, cohortId);
      const [vaultPda] = findVaultPda(challengePda);

      // Build the enroll instruction via the Shoot program
      const usdcMint =
        process.env.NEXT_PUBLIC_SOLANA_CLUSTER === "mainnet"
          ? USDC_MINT_MAINNET
          : USDC_MINT_DEVNET;
      const traderUsdc = await getAssociatedTokenAddress(usdcMint, traderKey);

      const enrollIx = await buildEnrollInstruction({
        trader: traderKey,
        challenge: challengePda,
        vault: vaultPda,
        traderUsdc,
        startingEquityUsd: 0, // Will be set from live position data
      });

      const { blockhash, lastValidBlockHeight } =
        await conn.getLatestBlockhash();

      const message = new TransactionMessage({
        payerKey: traderKey,
        recentBlockhash: blockhash,
        instructions: [enrollIx],
      }).compileToV0Message();

      const versionedTx = new VersionedTransaction(message);
      const serialized = versionedTx.serialize();

      const { signature: sigBytes } = await signAndSendTransaction({
        transaction: serialized,
        wallet: solanaWallet,
        chain: "solana:devnet",
      });

      const signature = bs58.encode(sigBytes);
      void conn.confirmTransaction(
        { signature, blockhash, lastValidBlockHeight },
        "confirmed"
      );

      setSelectedCohortId(cohortId);
      setEnrolledCohortId(cohortId);

      // Enrollment is persisted server-side via the enroll API call
      void loadCompetitionReceipts(walletAddress).then(setReceipts);
      void fetchBalance(walletAddress);

      addToast("success", `Entry confirmed! Sig: ${signature.slice(0, 10)}...`);
    } catch (error) {
      addToast("error", `Payment failed: ${formatError(error)}`);
    } finally {
      setIsSendingEnrollment(false);
    }
  }

  async function handleAirdrop() {
    if (!walletAddress) {
      addToast("info", "Sign in to request devnet SOL.");
      return;
    }
    setIsRequestingAirdrop(true);
    addToast("info", "Requesting 0.2 devnet SOL...");
    try {
      const conn = new Connection(DEVNET_RPC, "confirmed");
      const sig = await conn.requestAirdrop(
        new PublicKey(walletAddress),
        200_000_000
      );
      await conn.confirmTransaction(sig, "confirmed");
      void fetchBalance(walletAddress);
      addToast("success", "Airdrop confirmed. Balance updated.");
    } catch (error) {
      addToast("error", `Airdrop failed: ${formatError(error)}`);
    } finally {
      setIsRequestingAirdrop(false);
    }
  }

  return (
    <div className="flex flex-col">
      {/* ── Active challenge overlay ────────────────────────────────────── */}
      {activeChallenge && (
        <ActiveChallenge
          challenge={activeChallenge}
          onClose={() => setActiveChallenge(null)}
          onPass={async (tier) => {
            addToast(
              "success",
              `✓ ${tier.name} challenge passed! Badge unlocked.`
            );
            // Quest: challenge_pass + comeback trail if previously failed
            await questEngine.checkProgress("challenge_pass");
            if (hasFailedChallenge) {
              await questEngine.checkProgress("challenge_pass_after_fail");
            }
            setLiveQuestProgress(questEngine.getActiveQuests());
            // Streak: record activity on pass
            const days = await streakTracker.recordActivity();
            setLiveStreakDays(days);
            setLiveStreakState(streakTracker.checkWarning());
            // Badge: award tier completion badge
            const tierBadge = `${tier.id}_complete`;
            setEarnedBadges((prev) =>
              prev.includes(tierBadge) ? prev : [...prev, tierBadge]
            );
            if (tier.fundedEligible) {
              const fundedDays = tier.id === "apex" ? 180 : 90;
              const expiry = new Date(
                Date.now() + fundedDays * 86_400_000
              ).toISOString();
              setFundedExpiration(expiry);
              setEarnedBadges((prev) =>
                prev.includes("funded_trader")
                  ? prev
                  : [...prev, "funded_trader"]
              );
              addToast(
                "success",
                `Funded Trader status granted for ${fundedDays} days!`
              );
            }
            // Unbreakable badge check
            if (streakTracker.isUnbreakable()) {
              setEarnedBadges((prev) =>
                prev.includes("unbreakable") ? prev : [...prev, "unbreakable"]
              );
            }
          }}
          onFail={async (reason) => {
            addToast("error", `Challenge failed: ${reason}`);
            setHasFailedChallenge(true);
            // Quest: track failure
            const updated = await questEngine.checkProgress("challenge_fail");
            setLiveQuestProgress(updated);
            // Consolation raffle ticket on failure
            addToast(
              "info",
              "Consolation: +1 raffle ticket awarded for participation."
            );
          }}
          onRetry={async (tier, discountedFee) => {
            const attempts = (challengeAttempts[tier.id] ?? 1) + 1;
            setChallengeAttempts((prev) => ({ ...prev, [tier.id]: attempts }));
            const retried = makeInitialChallenge(tier.id, tier);
            retried.attemptNumber = attempts;
            setActiveChallenge(retried);
            // Quest: challenge_start on retry
            const updated = await questEngine.checkProgress("challenge_start");
            setLiveQuestProgress(updated);
            const streakResult = await streakTracker.recordActivity();
            setLiveStreakDays(streakResult);
            setLiveStreakState(streakTracker.checkWarning());
            addToast(
              "info",
              `Retrying ${tier.name} (Attempt #${attempts}) at $${discountedFee.toFixed(2)}`
            );
          }}
        />
      )}

      {/* ── Toast stack ────────────────────────────────────────────────── */}
      {toasts.length > 0 && (
        <div
          aria-live="polite"
          className="pointer-events-none fixed bottom-6 right-6 z-50 flex flex-col gap-2"
        >
          {toasts.map((t) => (
            <div key={t.id} className={`toast toast-${t.kind}`}>
              {t.message}
            </div>
          ))}
        </div>
      )}

      {/* ── Hero + wallet ──────────────────────────────────────────────── */}
      <section className="hero-grid mt-0">
        <div className="hero-panel">
          <h1 className="hero-title">Prop Challenge Hub</h1>
          <p className="hero-copy mt-2">Trade, rank, earn funded status.</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 mt-5">
            <div className="stat-card">
              <span>Volume share</span>
              <strong>{snapshot.season.volumeSharePercent}%</strong>
            </div>
            <div className="stat-card">
              <span>Live cohorts</span>
              <strong>{snapshot.season.cohortsRunning}</strong>
            </div>
            <div className="stat-card">
              <span>Paid entries</span>
              <strong>{snapshot.season.paidEntries}</strong>
            </div>
            <div className="stat-card">
              <span>Prize pool</span>
              <strong>
                {formatCurrency(snapshot.season.totalPrizePoolUsd)}
              </strong>
            </div>
          </div>
        </div>

        {/* ── Wallet panel ───────────────────────────────────────────── */}
        <aside className="wallet-panel">
          <div className="wallet-header">
            <div>
              <p className="eyebrow">Wallet + status</p>
              <h2 className="text-2xl font-semibold">Competition identity</h2>
            </div>
            <span className={`pill ${authenticated ? "pill-connected" : ""}`}>
              {authenticated ? "Connected" : "Not signed in"}
            </span>
          </div>

          {authenticated && walletAddress ? (
            <>
              <div className="wallet-address">
                {walletAddress.slice(0, 16)}...{walletAddress.slice(-16)}
              </div>

              <div className="wallet-balance-card">
                <div className="metric-line">
                  <span>Devnet balance</span>
                  <strong>
                    {balanceFetching
                      ? "Loading..."
                      : walletBalanceSol !== null
                        ? formatSol(walletBalanceSol)
                        : "0.000 SOL"}
                  </strong>
                </div>
                <div className="metric-line">
                  <span>Selected entry cost</span>
                  <strong>
                    {formatSol(selectedEntryFeeLamports / lamportsPerSol)}
                  </strong>
                </div>
                <div className="metric-line">
                  <span>Program</span>
                  <strong className="font-mono text-sm">
                    {SHOOT_PROGRAM_ID.toBase58().slice(0, 4)}...
                    {SHOOT_PROGRAM_ID.toBase58().slice(-4)}
                  </strong>
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => void handleAirdrop()}
                  disabled={isRequestingAirdrop}
                  className="action-button"
                >
                  {isRequestingAirdrop ? "Requesting..." : "Airdrop 0.2 SOL"}
                </button>
                <Link href="/design-doc" className="secondary-button">
                  Design doc
                </Link>
              </div>
            </>
          ) : (
            <WalletNotConnected onLogin={() => void login()} />
          )}

          <div className="wallet-status-grid">
            <div>
              <span>Funded status</span>
              <strong>{snapshot.viewer.fundedStatus}</strong>
            </div>
            <div>
              <span>Season points</span>
              <strong>{snapshot.viewer.seasonPoints}</strong>
            </div>
            <div>
              <span>Raffle tickets</span>
              <strong>{viewerRaffleTickets}</strong>
            </div>
            <div>
              <span>Streak</span>
              <strong>
                {viewerStreak.streakDays}d / {viewerStreak.streakState}
              </strong>
            </div>
          </div>

          {latestReceipt && (
            <>
              <div className="divider" />
              <div className="space-y-2">
                <p className="eyebrow">Latest entry receipt</p>
                <div className="metric-line text-sm">
                  <span>
                    {formatSol(latestReceipt.lamports / lamportsPerSol)} on{" "}
                    {formatDate(latestReceipt.createdAt)}
                  </span>
                  <a
                    className="underline underline-offset-4 text-white/60 hover:text-white"
                    href={`https://explorer.solana.com/tx/${latestReceipt.signature}?cluster=devnet`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {latestReceipt.signature.slice(0, 10)}...
                  </a>
                </div>
              </div>
            </>
          )}
        </aside>
      </section>

      {/* ── Tier Selector (Prop Challenge entry) ───────────────────────── */}
      <section className="panel mt-6">
        <TierSelector
          isAuthenticated={authenticated}
          onSelectTier={async (tierId) => {
            const attempts = (challengeAttempts[tierId] ?? 0) + 1;
            setChallengeAttempts((prev) => ({ ...prev, [tierId]: attempts }));
            const challenge = makeInitialChallenge(
              tierId,
              challengeTiers[tierId]
            );
            challenge.attemptNumber = attempts > 1 ? attempts : undefined;
            setActiveChallenge(challenge);
            // Quest + streak: challenge_start
            const updated = await questEngine.checkProgress("challenge_start");
            setLiveQuestProgress(updated);
            const streakResult = await streakTracker.recordActivity();
            setLiveStreakDays(streakResult);
            setLiveStreakState(streakTracker.checkWarning());
          }}
          onSelectSpecialist={async (type) => {
            const spec = specialistChallenges[type];
            if (!spec) return;
            const baseTier = challengeTiers.scout;
            const specialistTier = {
              ...baseTier,
              allowedMarkets: spec.markets,
            };
            const challenge = makeInitialChallenge("scout", specialistTier);
            challenge.assetClass = spec.name;
            setActiveChallenge(challenge);
            // Quest: generic start + specialist-specific event
            await questEngine.checkProgress("challenge_start");
            if (type === "metals")
              await questEngine.checkProgress("challenge_start_metals");
            if (type === "energy")
              await questEngine.checkProgress("challenge_start_energy");
            setLiveQuestProgress(questEngine.getActiveQuests());
            const streakResult = await streakTracker.recordActivity();
            setLiveStreakDays(streakResult);
            setLiveStreakState(streakTracker.checkWarning());
            addToast(
              "info",
              `Specialist: ${spec.name} — only ${spec.markets.join(", ")} trades allowed.`
            );
          }}
          onLogin={() => void login()}
        />
      </section>

      {/* ── Active Cohorts ──────────────────────────────────────────────── */}
      <section className="mt-8">
        <div className="panel">
          <h2 className="section-title mb-4">Active Cohorts</h2>

          <div className="grid gap-4 xl:grid-cols-3">
            {snapshot.cohorts.map((cohort) => {
              const isSelected = cohort.id === selectedCohort.id;
              const isEnrolled = cohort.id === enrolledCohortId;

              return (
                <article
                  key={cohort.id}
                  className={`cohort-card ${isSelected ? "cohort-card-active" : ""}`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="eyebrow">{cohort.preset.focus}</p>
                      <h3 className="text-2xl font-semibold">{cohort.name}</h3>
                    </div>
                    <span
                      className={`pill ${cohort.state === "live" ? "pill-live" : ""}`}
                    >
                      {stateLabel(cohort)}
                    </span>
                  </div>

                  <p className="text-sm leading-relaxed text-white/72">
                    {cohort.preset.tagline}
                  </p>
                  <p className="text-sm leading-relaxed text-white/58">
                    {cohort.narrative}
                  </p>

                  <dl className="grid grid-cols-2 gap-3 text-sm">
                    <div className="data-chip">
                      <dt>Entry</dt>
                      <dd>{formatCurrency(cohort.entryFeeUsd)}</dd>
                    </div>
                    <div className="data-chip">
                      <dt>Prize pool</dt>
                      <dd>{formatCurrency(cohort.rewardPoolUsd)}</dd>
                    </div>
                    <div className="data-chip">
                      <dt>Capacity</dt>
                      <dd>
                        {cohort.enrolledCount}/{cohort.participantCap}
                      </dd>
                    </div>
                    <div className="data-chip">
                      <dt>Ends</dt>
                      <dd>{formatDate(cohort.endTime)}</dd>
                    </div>
                  </dl>

                  <div className="mt-auto flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedCohortId(cohort.id)}
                      className="secondary-button py-2 px-3 text-xs"
                    >
                      Inspect
                    </button>
                    <button
                      type="button"
                      onClick={() => void handlePaidEnroll(cohort.id)}
                      disabled={isSendingEnrollment}
                      className="action-button py-2 px-3 text-xs"
                    >
                      {isEnrolled ? "Paid ✓" : "Pay on devnet"}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleQuickEnroll(cohort.id)}
                      className="secondary-button py-2 px-3 text-xs"
                    >
                      Demo enroll
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── Leaderboard + Rewards ──────────────────────────────────────── */}
      <div className="mt-8">
        <LeaderboardSection
          selectedCohort={selectedCohort}
          walletAddress={walletAddress}
          enrolledCohortId={enrolledCohortId}
          viewerRewardPreview={snapshot.viewer.rewardPreview}
          viewerFundedStatus={snapshot.viewer.fundedStatus}
          matchups={selectedCohort.matchups}
          activeRiskEvents={selectedCohort.activeRiskEvents}
        />
      </div>

      {/* ── SSE Status + Live Trade Feed ─────────────────────────────── */}
      <section className="mt-6">
        <div className="panel">
          <div className="flex items-center gap-3 mb-4">
            <h2 className="section-title">Live Feed</h2>
            <div className="flex items-center gap-1.5 ml-auto">
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 2,
                  background: sseConnected ? "#00FF87" : "#FF3D3D",
                }}
              />
              <span className="text-[10px] text-white/40">
                {sseConnected ? "Connected" : "Connecting..."}
                {sseLastUpdate &&
                  ` · Last update ${sseLastUpdate.toLocaleTimeString()}`}
              </span>
            </div>
          </div>
          {recentTrades.length > 0 ? (
            <LiveTradeFeed trades={recentTrades} />
          ) : (
            <div className="rounded-lg border border-dashed border-white/8 px-4 py-8 text-center">
              <p className="text-sm text-white/30">
                Listening for trade events...
              </p>
              <p className="text-xs text-white/20 mt-1">
                Closed positions will appear here in real-time
              </p>
            </div>
          )}
        </div>
      </section>

      {/* ── Matchups Section (Phase 2 Design) ────────────────────────── */}
      {selectedCohort.matchups && selectedCohort.matchups.length > 0 && (
        <section className="mt-8">
          <div className="panel">
            <h2 className="section-title mb-4">Head-to-Head Matchups</h2>
            <CompetitionMatchups
              matchups={selectedCohort.matchups}
              pnlRace={selectedCohort.pnlRace ?? null}
              deskStandings={selectedCohort.deskStandings ?? []}
              activeRiskEvents={selectedCohort.activeRiskEvents ?? []}
              standings={selectedCohort.standings}
            />
          </div>
        </section>
      )}

      {/* ── Commentary Feed (Phase 2 Design) ──────────────────────────── */}
      {selectedCohort.commentaryFeed && (
        <section className="mt-8">
          <div className="panel">
            <h2 className="section-title mb-4">Live Commentary</h2>
            <CompetitionCommentary
              feed={selectedCohort.commentaryFeed}
              voterWallet={walletAddress}
            />
          </div>
        </section>
      )}

      {/* ── Funded Desk Ladder (Phase 2 Design) ──────────────────────── */}
      <section className="mt-8">
        <div className="panel">
          <h2 className="section-title mb-4">Funded Desk</h2>
          <CompetitionFundedDesk
            currentLevel={(() => {
              const fs = snapshot.viewer.fundedStatus;
              if (fs === "qualified") return "funded";
              if (fs === "watchlist") return "watchlist";
              return "none";
            })()}
            promotionProgress={0.45}
            seasonPoints={snapshot.viewer.seasonPoints}
            revenueShareBps={
              FUNDED_LADDER.find((l) => {
                const fs = snapshot.viewer.fundedStatus;
                return (
                  l.level ===
                  (fs === "qualified"
                    ? "funded"
                    : fs === "watchlist"
                      ? "watchlist"
                      : "watchlist")
                );
              })?.revenueShareBps ?? 0
            }
          />
        </div>
      </section>

      {/* ── Projection lab + Funded desk ──────────────────────────────── */}
      <section className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr] mt-10">
        <ProjectionLab
          standings={selectedCohort.standings}
          initialInput={simulationInput}
          onInputChange={setSimulationInput}
        />

        <div className="panel">
          <h2 className="section-title mb-4">Funded Desk</h2>

          <div className="grid gap-3">
            {fundedDeskLadder.map((tier) => (
              <div key={tier.tier} className="reward-card">
                <div>
                  <p className="text-lg font-semibold">{tier.tier}</p>
                  <p className="text-sm text-white/58">{tier.target}</p>
                </div>
                <div className="max-w-[18rem] text-right text-sm text-white/72">
                  {tier.reward}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Engagement ──────────────────────────────────────────────────── */}
      <section className="mt-6">
        <div className="panel">
          <GamificationPanel
            questProgress={liveQuestProgress}
            streakDays={liveStreakDays}
            streakState={liveStreakState}
            raffleTickets={viewerRaffleTickets}
            fundedStatus={
              fundedExpiration ? "qualified" : snapshot.viewer.fundedStatus
            }
            seasonPoints={snapshot.viewer.seasonPoints}
            fundedExpiration={fundedExpiration ?? undefined}
            earnedBadgeIds={earnedBadges}
            rivalries={selectedCohort.commentaryFeed?.rivalries}
          />
        </div>
      </section>
    </div>
  );
}
