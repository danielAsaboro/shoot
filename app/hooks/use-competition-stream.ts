"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { StandingsEntry } from "@/lib/competition/types";

interface UseCompetitionStreamResult {
  standings: StandingsEntry[] | null;
  connected: boolean;
  lastUpdate: Date | null;
}

export function useCompetitionStream(
  enabled: boolean
): UseCompetitionStreamResult {
  const [standings, setStandings] = useState<StandingsEntry[] | null>(null);
  const [connected, setConnected] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const connectRef = useRef<() => void>(() => {});

  const cleanup = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
  }, []);

  const connect = useCallback(() => {
    cleanup();

    const es = new EventSource("/api/competition/stream");
    eventSourceRef.current = es;

    es.addEventListener("connected", () => {
      setConnected(true);
    });

    es.addEventListener("leaderboard-update", (event: MessageEvent) => {
      try {
        const payload = JSON.parse(event.data) as {
          standings: StandingsEntry[];
          timestamp: string;
        };
        setStandings(payload.standings);
        setLastUpdate(new Date(payload.timestamp));
      } catch {
        // Ignore malformed events
      }
    });

    es.onerror = () => {
      setConnected(false);
      es.close();
      eventSourceRef.current = null;

      // Reconnect with 5s backoff
      reconnectTimeoutRef.current = setTimeout(() => {
        reconnectTimeoutRef.current = null;
        connectRef.current();
      }, 5_000);
    };
  }, [cleanup]);

  // Keep ref in sync with latest connect callback
  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  useEffect(() => {
    if (enabled) {
      connect();
    } else {
      cleanup();
      requestAnimationFrame(() => setConnected(false));
    }

    return cleanup;
  }, [enabled, connect, cleanup]);

  return { standings, connected, lastUpdate };
}
