import { prisma } from "./client.ts";
import type { SybilFlagStatus } from "../generated/prisma/client.ts";

// ── Cohorts ─────────────────────────────────────────────────────────────────

export async function getCohort(id: string) {
  return prisma.cohort.findUnique({ where: { id } });
}

export async function getActiveCohorts() {
  return prisma.cohort.findMany({
    where: { state: { in: ["live", "upcoming"] } },
    orderBy: { startTime: "asc" },
  });
}

export async function getAllCohorts() {
  return prisma.cohort.findMany({ orderBy: { startTime: "desc" } });
}

export async function createCohort(data: {
  id: string;
  name: string;
  presetId: string;
  state?: string;
  startTime: Date;
  endTime: Date;
  narrative?: string;
  rewardPoolUsd: number;
  entryFeeUsd: number;
  participantCap: number;
  specialistType?: string;
  scoringMode?: string;
}) {
  return prisma.cohort.create({ data });
}

export async function updateCohortState(id: string, state: string) {
  return prisma.cohort.update({ where: { id }, data: { state } });
}

export async function getEnrolledWalletsForCohort(cohortId: string): Promise<string[]> {
  const enrollments = await prisma.enrollment.findMany({
    where: { cohortId },
    select: { wallet: true },
  });
  return enrollments.map((e) => e.wallet);
}

// ── Enrollments ─────────────────────────────────────────────────────────────

export async function enrollTrader(
  wallet: string,
  cohortId: string,
  txSignature?: string,
  startingEquity?: number
) {
  return prisma.enrollment.upsert({
    where: { wallet_cohortId: { wallet, cohortId } },
    create: { wallet, cohortId, txSignature, startingEquity },
    update: { txSignature },
    // Note: startingEquity is intentionally NOT updated on upsert.
    // Once set at enrollment, it becomes the immutable ROI denominator.
  });
}

export async function getEnrollment(wallet: string, cohortId: string) {
  return prisma.enrollment.findUnique({
    where: { wallet_cohortId: { wallet, cohortId } },
  });
}

export async function getEnrollmentsForCohort(cohortId: string) {
  return prisma.enrollment.findMany({ where: { cohortId } });
}

export async function getEnrollmentForWallet(wallet: string) {
  return prisma.enrollment.findFirst({
    where: { wallet },
    orderBy: { enrolledAt: "desc" },
  });
}

export async function getEnrollmentsByWallet(wallet: string) {
  return prisma.enrollment.findMany({
    where: { wallet },
    orderBy: { enrolledAt: "desc" },
  });
}

// ── Trader Scores ───────────────────────────────────────────────────────────

export async function upsertTraderScore(data: {
  wallet: string;
  cohortId: string;
  tournamentScore: number;
  pnlPercent: number;
  volumeUsd: number;
  winRate: number;
  consistencyScore: number;
  maxDrawdownPercent: number;
  tradeCount: number;
  activeDays: number;
  mutagenTotal?: number;
  mutagenTradeCount?: number;
}) {
  return prisma.traderScore.upsert({
    where: { wallet_cohortId: { wallet: data.wallet, cohortId: data.cohortId } },
    create: data,
    update: { ...data, computedAt: new Date() },
  });
}

export async function getLeaderboard(cohortId: string) {
  return prisma.traderScore.findMany({
    where: { cohortId },
    orderBy: { tournamentScore: "desc" },
  });
}

// ── Quest Progress ──────────────────────────────────────────────────────────

export async function updateQuestProgress(
  wallet: string,
  questId: string,
  progress: number,
  completed = false
) {
  return prisma.questProgress.upsert({
    where: { wallet_questId: { wallet, questId } },
    create: {
      wallet,
      questId,
      progress,
      completedAt: completed ? new Date() : null,
    },
    update: {
      progress,
      completedAt: completed ? new Date() : undefined,
    },
  });
}

export async function getQuestProgress(wallet: string) {
  return prisma.questProgress.findMany({ where: { wallet } });
}

// ── Streak State ────────────────────────────────────────────────────────────

export async function updateStreak(
  wallet: string,
  streakDays: number,
  lastActivityDate: string
) {
  return prisma.streakState.upsert({
    where: { wallet },
    create: { wallet, streakDays, lastActivityDate },
    update: { streakDays, lastActivityDate },
  });
}

export async function getStreak(wallet: string) {
  return prisma.streakState.findUnique({ where: { wallet } });
}

// ── Sybil Flags ─────────────────────────────────────────────────────────────

export async function flagSybil(data: {
  wallet: string;
  cohortId: string;
  flagCode: string;
  reason?: string;
  confidence?: string;
}) {
  return prisma.sybilFlag.upsert({
    where: {
      wallet_cohortId_flagCode: {
        wallet: data.wallet,
        cohortId: data.cohortId,
        flagCode: data.flagCode,
      },
    },
    create: data,
    update: { reason: data.reason, confidence: data.confidence },
  });
}

export async function getSybilFlags(cohortId?: string) {
  return prisma.sybilFlag.findMany({
    where: cohortId ? { cohortId } : undefined,
    orderBy: { createdAt: "desc" },
    include: { auditLogs: true },
  });
}

export async function getPendingSybilFlags() {
  return prisma.sybilFlag.findMany({
    where: { status: "pending" },
    orderBy: { createdAt: "desc" },
    include: { auditLogs: true },
  });
}

export async function updateSybilReview(
  flagId: string,
  status: SybilFlagStatus,
  adminWallet: string,
  reason?: string
) {
  const [flag] = await prisma.$transaction([
    prisma.sybilFlag.update({
      where: { id: flagId },
      data: { status, reviewedBy: adminWallet, reviewedAt: new Date() },
    }),
    prisma.sybilAuditLog.create({
      data: {
        flagId,
        action: status,
        adminWallet,
        reason,
      },
    }),
  ]);
  return flag;
}

// ── Raffle Entries ──────────────────────────────────────────────────────────

export async function addRaffleTickets(
  wallet: string,
  cohortId: string,
  tickets: number,
  source: string
) {
  return prisma.raffleEntry.create({
    data: { wallet, cohortId, tickets, source },
  });
}

export async function getRaffleTickets(wallet: string, cohortId?: string) {
  const result = await prisma.raffleEntry.aggregate({
    where: { wallet, ...(cohortId ? { cohortId } : {}) },
    _sum: { tickets: true },
  });
  return result._sum.tickets ?? 0;
}

// ── Trade Events ────────────────────────────────────────────────────────────

export async function upsertTradeEvent(data: {
  wallet: string;
  positionPubkey: string;
  custodyMint: string;
  side: string;
  sizeUsd: number;
  price: number;
  collateralUsd: number;
  profitUsd: number;
  lossUsd: number;
  netPnl: number;
  borrowFeeUsd: number;
  exitFeeUsd: number;
  positionId: string;
  percentageClosed: string;
  txSignature?: string;
  slot?: string;
  closedAt: Date;
}) {
  return prisma.tradeEvent.upsert({
    where: {
      positionId_txSignature: {
        positionId: data.positionId,
        txSignature: data.txSignature ?? "",
      },
    },
    create: { ...data, txSignature: data.txSignature ?? null },
    update: {},
  });
}

export async function getTradeEventsForWallet(
  wallet: string,
  windowStart: Date,
  windowEnd: Date
) {
  return prisma.tradeEvent.findMany({
    where: {
      wallet,
      closedAt: { gte: windowStart, lte: windowEnd },
    },
    orderBy: { closedAt: "asc" },
  });
}

export async function getTradeEventCountSince(since: Date) {
  return prisma.tradeEvent.count({
    where: { closedAt: { gte: since } },
  });
}

// ── Equity Snapshots ────────────────────────────────────────────────────────

export async function addEquitySnapshot(
  wallet: string,
  cohortId: string,
  equity: number
) {
  return prisma.equitySnapshot.create({
    data: { wallet, cohortId, equity, snapshotAt: new Date() },
  });
}

export async function getEquitySnapshots(wallet: string, cohortId: string) {
  return prisma.equitySnapshot.findMany({
    where: { wallet, cohortId },
    orderBy: { snapshotAt: "asc" },
  });
}

// ── Competition Results ─────────────────────────────────────────────────────

export async function saveCompetitionResult(data: {
  cohortId: string;
  wallet: string;
  finalRank: number;
  finalScore: number;
  payoutUsd?: number;
  fundedStatus?: string;
}) {
  return prisma.competitionResult.upsert({
    where: { cohortId_wallet: { cohortId: data.cohortId, wallet: data.wallet } },
    create: data,
    update: data,
  });
}

export async function getCompetitionResults(cohortId: string) {
  return prisma.competitionResult.findMany({
    where: { cohortId },
    orderBy: { finalRank: "asc" },
  });
}

// ── Spectator Votes ─────────────────────────────────────────────────────────

export async function upsertVote(
  matchId: string,
  voterWallet: string,
  votedFor: string
) {
  return prisma.spectatorVote.upsert({
    where: { matchId_voterWallet: { matchId, voterWallet } },
    create: { matchId, voterWallet, votedFor },
    update: { votedFor },
  });
}

export async function getVotesForMatch(matchId: string) {
  return prisma.spectatorVote.findMany({ where: { matchId } });
}

export async function getVoteCountsByMatch(matchId: string) {
  const votes = await prisma.spectatorVote.groupBy({
    by: ["votedFor"],
    where: { matchId },
    _count: true,
  });
  return votes.map((v) => ({ wallet: v.votedFor, count: v._count }));
}

// ── World Cup ───────────────────────────────────────────────────────────────

export async function createWorldCupSeason(
  cupId: string,
  startTime: Date,
  endTime: Date
) {
  return prisma.worldCupSeason.create({
    data: { cupId, startTime, endTime },
  });
}

export async function getActiveWorldCupSeason(cupId: string) {
  return prisma.worldCupSeason.findFirst({
    where: { cupId, state: { not: "closed" } },
    orderBy: { createdAt: "desc" },
    include: { groups: true, matches: true },
  });
}

export async function createWorldCupGroup(
  seasonId: string,
  groupName: string,
  wallets: string[]
) {
  return prisma.worldCupGroup.create({
    data: { seasonId, groupName, wallets },
  });
}

export async function getGroupsForSeason(seasonId: string) {
  return prisma.worldCupGroup.findMany({
    where: { seasonId },
  });
}

export async function upsertWorldCupMatch(data: {
  seasonId: string;
  round: string;
  traderA: string;
  traderB: string;
  scheduledAt: Date;
}) {
  return prisma.worldCupMatch.create({ data });
}

export async function updateMatchResult(
  matchId: string,
  scoreA: number,
  scoreB: number,
  winner: string
) {
  return prisma.worldCupMatch.update({
    where: { id: matchId },
    data: { scoreA, scoreB, winner, completedAt: new Date() },
  });
}

export async function getMatchesForSeason(seasonId: string, round?: string) {
  return prisma.worldCupMatch.findMany({
    where: { seasonId, ...(round ? { round } : {}) },
    orderBy: { scheduledAt: "asc" },
  });
}

// ── Desk Membership ─────────────────────────────────────────────────────────

export async function joinDesk(deskId: string, wallet: string, role = "member") {
  return prisma.deskMembership.upsert({
    where: { deskId_wallet: { deskId, wallet } },
    create: { deskId, wallet, role },
    update: { role },
  });
}

export async function getDeskMembers(deskId: string) {
  return prisma.deskMembership.findMany({ where: { deskId } });
}

export async function getDesksForWallet(wallet: string) {
  return prisma.deskMembership.findMany({ where: { wallet } });
}

// ── Narrative Beats ─────────────────────────────────────────────────────────

export async function createNarrativeBeat(data: {
  cohortId: string;
  type: string;
  headline: string;
  subtext?: string;
  severity?: string;
}) {
  return prisma.narrativeBeat.create({ data });
}

export async function getRecentBeats(cohortId: string, limit = 20) {
  return prisma.narrativeBeat.findMany({
    where: { cohortId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}
