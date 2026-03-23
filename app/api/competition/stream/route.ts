import { getCompetitionSnapshotResponse } from "@/lib/competition/provider";
import type { StandingsEntry } from "@/lib/competition/types";
import {
  AdrenaWsConsumer,
  type ParsedTradeEvent,
} from "@/lib/adrena/ws-consumer";
import { generatePropNarrativeBeats } from "@/lib/competition/narrative";
import {
  generateStorylineBeats,
  generateMatchSummary,
} from "@/lib/competition/narrative-archetypes";
import { prisma } from "@/lib/db/client";

function formatSSE(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function standingsFingerprint(standings: StandingsEntry[]): string {
  return standings
    .map((s) => `${s.wallet}:${s.rank}:${s.tournamentScore}:${s.pnlPercent}`)
    .join("|");
}

export async function GET() {
  const encoder = new TextEncoder();

  let pollIntervalId: ReturnType<typeof setInterval> | null = null;
  let keepAliveIntervalId: ReturnType<typeof setInterval> | null = null;
  let tradeClosedHandler: ((event: ParsedTradeEvent) => void) | null = null;

  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(
        encoder.encode(
          formatSSE("connected", {
            status: "ok",
            timestamp: new Date().toISOString(),
          })
        )
      );

      let previousFingerprint: string | null = null;
      const previousStandingsByCohort = new Map<string, StandingsEntry[]>();

      // ── Real-time: forward trade-closed events from WebSocket consumer ──
      try {
        const consumer = AdrenaWsConsumer.getInstance();
        if (consumer.isConnected()) {
          tradeClosedHandler = (event: ParsedTradeEvent) => {
            try {
              controller.enqueue(
                encoder.encode(
                  formatSSE("trade-event", {
                    wallet: event.wallet,
                    positionId: event.positionId,
                    side: event.side,
                    sizeUsd: event.sizeUsd,
                    netPnl: event.netPnl,
                    price: event.price,
                    timestamp: event.closedAt.toISOString(),
                  })
                )
              );
            } catch {
              // Controller closed
            }
          };
          consumer.on("trade-closed", tradeClosedHandler);
        }
      } catch {
        // WS consumer not initialized — skip
      }

      // ── Polling fallback: check every 30s for leaderboard changes ──
      pollIntervalId = setInterval(async () => {
        try {
          const { snapshot } = await getCompetitionSnapshotResponse();

          const allStandings: StandingsEntry[] = snapshot.cohorts.flatMap(
            (cohort) => cohort.standings
          );

          const currentFingerprint = standingsFingerprint(allStandings);

          if (
            previousFingerprint !== null &&
            currentFingerprint !== previousFingerprint
          ) {
            controller.enqueue(
              encoder.encode(
                formatSSE("leaderboard-update", {
                  standings: allStandings,
                  timestamp: new Date().toISOString(),
                })
              )
            );

            // Generate and emit narrative beats for active cohorts
            for (const cohort of snapshot.cohorts) {
              if (cohort.state !== "live") continue;
              try {
                // Core narrative beats (rank surges, golden trades, etc.)
                const coreBeats = generatePropNarrativeBeats(
                  cohort,
                  cohort.matchups ?? [],
                  cohort.activeRiskEvents ?? [],
                  cohort.commentaryFeed?.goldenTrade ?? undefined,
                  cohort.deskStandings ?? undefined
                );

                // Storyline beats (continuity, archetypes, closing gaps)
                const prevStandings =
                  previousStandingsByCohort.get(cohort.id) ?? [];
                const storylineBeats = generateStorylineBeats(
                  cohort.id,
                  cohort.standings,
                  prevStandings
                );

                // Match summary beats
                const matchSummaryBeats = (cohort.matchups ?? [])
                  .map((m) =>
                    generateMatchSummary(m, cohort.standings, cohort.id)
                  )
                  .filter((b): b is NonNullable<typeof b> => b !== null);

                const allBeats = [
                  ...coreBeats,
                  ...storylineBeats,
                  ...matchSummaryBeats,
                ];

                // Store current standings for next comparison
                previousStandingsByCohort.set(cohort.id, [...cohort.standings]);

                if (allBeats.length > 0) {
                  const emittedBeats = allBeats.slice(0, 8);
                  controller.enqueue(
                    encoder.encode(
                      formatSSE("narrative", {
                        cohortId: cohort.id,
                        beats: emittedBeats,
                        timestamp: new Date().toISOString(),
                      })
                    )
                  );

                  // Persist beats to DB (fire-and-forget)
                  prisma.narrativeBeat
                    .createMany({
                      data: emittedBeats.map((b) => ({
                        cohortId: b.cohortId,
                        type: b.type,
                        headline: b.headline,
                        subtext: b.subtext,
                        severity: b.severity,
                      })),
                      skipDuplicates: true,
                    })
                    .catch(() => {
                      // DB persistence is best-effort
                    });
                }
              } catch {
                // Narrative generation failure is non-fatal
              }
            }
          }

          previousFingerprint = currentFingerprint;
        } catch {
          // Silently skip failed polls
        }
      }, 30_000);

      // SSE keep-alive every 15s
      keepAliveIntervalId = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(":\n\n"));
        } catch {
          if (pollIntervalId) clearInterval(pollIntervalId);
          if (keepAliveIntervalId) clearInterval(keepAliveIntervalId);
        }
      }, 15_000);
    },

    cancel() {
      if (pollIntervalId) clearInterval(pollIntervalId);
      if (keepAliveIntervalId) clearInterval(keepAliveIntervalId);

      // Unsubscribe from WS consumer
      if (tradeClosedHandler) {
        try {
          AdrenaWsConsumer.getInstance().removeListener(
            "trade-closed",
            tradeClosedHandler
          );
        } catch {
          // Consumer may not exist
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
