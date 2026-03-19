import type {
  CommentaryFeed,
  CompetitionCohortView,
  CrowdFavorite,
  HeadToHeadMatch,
  PropRivalry,
  RiskEvent,
  SpectatorVote,
} from "./types.ts";
import { generatePropNarrativeBeats, findCohortGoldenTrade } from "./narrative.ts";
import { detectRivalries } from "./rivalries.ts";

// ── Crowd Favorites Computation ──────────────────────────────────────────────

export function computeCrowdFavorites(
  votes: SpectatorVote[],
  matchups: HeadToHeadMatch[]
): CrowdFavorite[] {
  // Group votes by match
  const votesByMatch = new Map<string, SpectatorVote[]>();
  for (const vote of votes) {
    const existing = votesByMatch.get(vote.matchId) ?? [];
    existing.push(vote);
    votesByMatch.set(vote.matchId, existing);
  }

  const favorites: CrowdFavorite[] = [];

  for (const match of matchups) {
    const matchVotes = votesByMatch.get(match.id) ?? [];
    if (matchVotes.length === 0) continue;

    // Count votes per trader
    const counts = new Map<string, number>();
    for (const vote of matchVotes) {
      counts.set(vote.votedFor, (counts.get(vote.votedFor) ?? 0) + 1);
    }

    // Find leader
    let leadingTrader = match.traderA;
    let maxVotes = 0;
    for (const [trader, count] of counts) {
      if (count > maxVotes) {
        maxVotes = count;
        leadingTrader = trader;
      }
    }

    favorites.push({
      matchId: match.id,
      totalVotes: matchVotes.length,
      leadingTrader,
      isFeatured: matchVotes.length > 30,
    });
  }

  // Sort by total votes descending
  favorites.sort((a, b) => b.totalVotes - a.totalVotes);
  return favorites;
}

// ── Commentary Feed Builder ──────────────────────────────────────────────────

export async function buildCommentaryFeed(
  cohort: CompetitionCohortView,
  matchups: HeadToHeadMatch[],
  riskEvents: RiskEvent[]
): Promise<CommentaryFeed> {
  const goldenTrade = findCohortGoldenTrade(cohort.id, cohort.standings);
  const beats = generatePropNarrativeBeats(
    cohort,
    matchups,
    riskEvents,
    goldenTrade ?? undefined,
    cohort.deskStandings
  );
  const rivalries: PropRivalry[] = detectRivalries(matchups);

  // Load real votes from DB
  const { getVotesForMatch } = await import("../db/queries.ts");
  const allVotes: SpectatorVote[] = [];
  for (const match of matchups) {
    const votes = await getVotesForMatch(match.id);
    allVotes.push(
      ...votes.map((v) => ({
        matchId: v.matchId,
        voterWallet: v.voterWallet,
        votedFor: v.votedFor,
        timestamp: v.createdAt.getTime(),
      }))
    );
  }
  const crowdFavorites = computeCrowdFavorites(allVotes, matchups);

  return {
    cohortId: cohort.id,
    beats,
    goldenTrade,
    crowdFavorites,
    rivalries,
    riskEvents,
  };
}
