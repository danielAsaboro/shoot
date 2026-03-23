"use client";

import { useState, useEffect, useCallback } from "react";
import { ClusterSelector } from "@/app/components/cluster-selector";

interface RefreshResult {
  status: string;
  refreshedAt: string;
  durationMs: number;
  activeCohorts: number;
  totalTraders: number;
  error?: string;
}

interface RefreshStatus {
  lastRefreshAt: string | null;
  lastRefreshDurationMs: number | null;
}

interface StandingsEntry {
  wallet: string;
  displayName: string;
  rank: number;
  tournamentScore: number;
  pnlPercent: number;
  volumeUsd: number;
  winRate: number;
  tradeCount: number;
  abuseFlags: string[];
}

interface AbuseResult {
  wallet: string;
  flags: string[];
  reason: string;
}

interface CohortView {
  id: string;
  name: string;
  state: string;
  startTime: string;
  endTime: string;
  participantCap: number;
  enrolledCount: number;
  standings: StandingsEntry[];
  abuseResults: AbuseResult[];
}

interface SnapshotResponse {
  integration: {
    provider: string;
    label: string;
    detail: string;
    configured: boolean;
  };
  snapshot: {
    cohorts: CohortView[];
  };
}

export default function AdminPage() {
  const [snapshot, setSnapshot] = useState<SnapshotResponse | null>(null);
  const [refreshStatus, setRefreshStatus] = useState<RefreshStatus | null>(
    null
  );
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefreshResult, setLastRefreshResult] =
    useState<RefreshResult | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchSnapshot = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/competition/snapshot");
      const data = await res.json();
      setSnapshot(data);
    } catch (err) {
      console.error("Failed to fetch snapshot:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchRefreshStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/competition/refresh");
      const data = await res.json();
      setRefreshStatus(data);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    fetchSnapshot();
    fetchRefreshStatus();
  }, [fetchSnapshot, fetchRefreshStatus]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const res = await fetch("/api/competition/refresh", { method: "POST" });
      const data = await res.json();
      setLastRefreshResult(data);
      await fetchSnapshot();
      await fetchRefreshStatus();
    } catch (err) {
      console.error("Refresh failed:", err);
    } finally {
      setRefreshing(false);
    }
  };

  const cohorts = snapshot?.snapshot?.cohorts ?? [];
  const integration = snapshot?.integration;
  const allFlagged = cohorts.flatMap((c) =>
    (c.abuseResults ?? [])
      .filter((r) => r.flags?.length > 0)
      .map((r) => ({ ...r, cohortId: c.id, cohortName: c.name }))
  );

  return (
    <div
      style={{
        maxWidth: 1100,
        margin: "0 auto",
        padding: "2rem",
        fontFamily: "monospace",
        color: "#e0e0e0",
        background: "#0a0a0a",
        minHeight: "100vh",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "0.5rem",
        }}
      >
        <h1 style={{ fontSize: "1.5rem" }}>Competition Admin</h1>
        <ClusterSelector />
      </div>

      {/* Provider Info */}
      <div style={panelStyle}>
        <span style={{ fontSize: "0.85rem", color: "#16a34a" }}>
          Adrena Live
        </span>
        <span
          style={{ marginLeft: "auto", fontSize: "0.75rem", color: "#666" }}
        >
          {integration?.label} — {integration?.detail?.slice(0, 80)}
        </span>
      </div>

      {/* Refresh Controls */}
      <div style={panelStyle}>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          style={{
            padding: "0.5rem 1.25rem",
            borderRadius: 6,
            border: "none",
            cursor: refreshing ? "not-allowed" : "pointer",
            background: refreshing ? "#333" : "#ca8a04",
            color: "#000",
            fontWeight: "bold",
            fontSize: "0.85rem",
          }}
        >
          {refreshing ? "Refreshing..." : "Recompute Scores"}
        </button>
        <span style={{ fontSize: "0.75rem", color: "#666" }}>
          Last refresh:{" "}
          {refreshStatus?.lastRefreshAt
            ? `${refreshStatus.lastRefreshAt} (${refreshStatus.lastRefreshDurationMs}ms)`
            : "never"}
        </span>
        {lastRefreshResult && (
          <span
            style={{
              fontSize: "0.75rem",
              color: lastRefreshResult.status === "ok" ? "#4ade80" : "#f87171",
            }}
          >
            {lastRefreshResult.status === "ok"
              ? `OK — ${lastRefreshResult.totalTraders} traders across ${lastRefreshResult.activeCohorts} cohorts in ${lastRefreshResult.durationMs}ms`
              : `Error: ${lastRefreshResult.error}`}
          </span>
        )}
      </div>

      {loading && <p style={{ color: "#666" }}>Loading...</p>}

      {/* Cohorts Summary */}
      {cohorts.length > 0 && (
        <div style={{ marginBottom: "2rem" }}>
          <h2 style={{ fontSize: "1.1rem", marginBottom: "0.75rem" }}>
            Cohorts ({cohorts.length})
          </h2>
          <table style={tableStyle}>
            <thead>
              <tr style={headerRowStyle}>
                <th style={thLeft}>Name</th>
                <th style={thLeft}>State</th>
                <th style={thLeft}>Window</th>
                <th style={thRight}>Traders</th>
              </tr>
            </thead>
            <tbody>
              {cohorts.map((c) => (
                <tr key={c.id} style={rowStyle}>
                  <td style={cellStyle}>{c.name}</td>
                  <td style={cellStyle}>
                    <span
                      style={{
                        padding: "0.15rem 0.5rem",
                        borderRadius: 4,
                        fontSize: "0.7rem",
                        background:
                          c.state === "live" ? "#16a34a22" : "#33333344",
                        color: c.state === "live" ? "#4ade80" : "#888",
                      }}
                    >
                      {c.state}
                    </span>
                  </td>
                  <td
                    style={{ ...cellStyle, fontSize: "0.75rem", color: "#888" }}
                  >
                    {new Date(c.startTime).toLocaleDateString()} —{" "}
                    {new Date(c.endTime).toLocaleDateString()}
                  </td>
                  <td style={{ ...cellStyle, textAlign: "right" }}>
                    {c.standings?.length ?? c.enrolledCount} /{" "}
                    {c.participantCap}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Leaderboards per cohort */}
      {cohorts.map((c) => {
        const standings = c.standings ?? [];
        if (standings.length === 0) return null;
        return (
          <div key={c.id} style={{ marginBottom: "2rem" }}>
            <h2 style={{ fontSize: "1rem", marginBottom: "0.5rem" }}>
              {c.name} — Leaderboard
            </h2>
            <table style={tableStyle}>
              <thead>
                <tr style={headerRowStyle}>
                  <th style={thRight}>#</th>
                  <th style={thLeft}>Wallet</th>
                  <th style={thRight}>Score</th>
                  <th style={thRight}>PnL%</th>
                  <th style={thRight}>Win Rate</th>
                  <th style={thRight}>Trades</th>
                  <th style={thRight}>Volume</th>
                  <th style={thLeft}>Flags</th>
                </tr>
              </thead>
              <tbody>
                {standings.map((t) => (
                  <tr
                    key={t.wallet}
                    style={{
                      ...rowStyle,
                      opacity: t.abuseFlags?.length > 0 ? 0.5 : 1,
                    }}
                  >
                    <td style={{ ...cellStyle, textAlign: "right" }}>
                      {t.rank}
                    </td>
                    <td style={cellStyle}>{t.displayName}</td>
                    <td
                      style={{
                        ...cellStyle,
                        textAlign: "right",
                        color: t.tournamentScore > 0 ? "#4ade80" : "#f87171",
                      }}
                    >
                      {t.tournamentScore.toFixed(1)}
                    </td>
                    <td
                      style={{
                        ...cellStyle,
                        textAlign: "right",
                        color: t.pnlPercent >= 0 ? "#4ade80" : "#f87171",
                      }}
                    >
                      {t.pnlPercent.toFixed(1)}%
                    </td>
                    <td style={{ ...cellStyle, textAlign: "right" }}>
                      {t.winRate.toFixed(0)}%
                    </td>
                    <td style={{ ...cellStyle, textAlign: "right" }}>
                      {t.tradeCount}
                    </td>
                    <td
                      style={{
                        ...cellStyle,
                        textAlign: "right",
                        color: "#888",
                        fontSize: "0.7rem",
                      }}
                    >
                      ${formatVolume(t.volumeUsd)}
                    </td>
                    <td style={{ ...cellStyle, fontSize: "0.7rem" }}>
                      {t.abuseFlags?.map((f: string) => (
                        <span
                          key={f}
                          style={{
                            background: "#dc262622",
                            color: "#f87171",
                            padding: "0.1rem 0.4rem",
                            borderRadius: 3,
                            marginRight: 4,
                          }}
                        >
                          {f}
                        </span>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}

      {/* Sybil Batch Detection */}
      <div style={panelStyle}>
        <button
          onClick={async () => {
            try {
              const res = await fetch("/api/admin/sybil/batch-detect", {
                method: "POST",
              });
              const data = await res.json();
              alert(
                `Sybil detection complete: ${JSON.stringify(data.cohorts?.map((c: { cohortId: string; totalFlags: number }) => `${c.cohortId}: ${c.totalFlags} flags`))}`
              );
            } catch (err) {
              alert(`Batch detection failed: ${err}`);
            }
          }}
          style={{
            padding: "0.5rem 1.25rem",
            borderRadius: 6,
            border: "none",
            cursor: "pointer",
            background: "#dc2626",
            color: "#fff",
            fontWeight: "bold",
            fontSize: "0.85rem",
          }}
        >
          Run Sybil Batch Detection
        </button>
        <span style={{ fontSize: "0.75rem", color: "#666" }}>
          Scans all cohorts for funding clusters, pattern correlation, and PnL
          mirroring
        </span>
      </div>

      {/* Abuse Review Queue */}
      {allFlagged.length > 0 && (
        <div style={{ marginBottom: "2rem" }}>
          <h2
            style={{
              fontSize: "1.1rem",
              marginBottom: "0.75rem",
              color: "#f87171",
            }}
          >
            Abuse Review Queue ({allFlagged.length})
          </h2>
          <table style={tableStyle}>
            <thead>
              <tr style={headerRowStyle}>
                <th style={thLeft}>Wallet</th>
                <th style={thLeft}>Cohort</th>
                <th style={thLeft}>Flags</th>
                <th style={thLeft}>Reason</th>
                <th style={thLeft}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {allFlagged.map((r, i) => (
                <tr key={`${r.wallet}-${i}`} style={rowStyle}>
                  <td style={cellStyle}>
                    {r.wallet.slice(0, 4)}...{r.wallet.slice(-4)}
                  </td>
                  <td style={cellStyle}>{r.cohortName}</td>
                  <td style={cellStyle}>{r.flags.join(", ")}</td>
                  <td
                    style={{ ...cellStyle, color: "#888", fontSize: "0.7rem" }}
                  >
                    {r.reason}
                  </td>
                  <td style={cellStyle}>
                    <div style={{ display: "flex", gap: "0.5rem" }}>
                      <button
                        onClick={async () => {
                          const reason = prompt("Reason for approval?");
                          if (reason === null) return;
                          await fetch("/api/admin/sybil/review", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              flagId: `${r.wallet}-${r.cohortId}`,
                              action: "approved",
                              adminWallet: "admin",
                              reason,
                            }),
                          });
                          alert("Flag approved (confirmed sybil)");
                        }}
                        style={{
                          padding: "0.2rem 0.6rem",
                          borderRadius: 4,
                          border: "none",
                          cursor: "pointer",
                          background: "#dc262644",
                          color: "#f87171",
                          fontSize: "0.7rem",
                          fontWeight: "bold",
                        }}
                      >
                        Confirm
                      </button>
                      <button
                        onClick={async () => {
                          const reason = prompt("Reason for rejection?");
                          if (reason === null) return;
                          await fetch("/api/admin/sybil/review", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              flagId: `${r.wallet}-${r.cohortId}`,
                              action: "rejected",
                              adminWallet: "admin",
                              reason,
                            }),
                          });
                          alert("Flag rejected (false positive)");
                        }}
                        style={{
                          padding: "0.2rem 0.6rem",
                          borderRadius: 4,
                          border: "none",
                          cursor: "pointer",
                          background: "#16a34a44",
                          color: "#4ade80",
                          fontSize: "0.7rem",
                          fontWeight: "bold",
                        }}
                      >
                        Reject
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function formatVolume(v: number): string {
  if (v > 1e9) return (v / 1e9).toFixed(1) + "B";
  if (v > 1e6) return (v / 1e6).toFixed(1) + "M";
  if (v > 1e3) return (v / 1e3).toFixed(0) + "K";
  return v.toFixed(0);
}

const panelStyle: React.CSSProperties = {
  display: "flex",
  gap: "1rem",
  alignItems: "center",
  marginBottom: "1.5rem",
  padding: "0.75rem 1rem",
  background: "#111",
  borderRadius: 8,
  border: "1px solid #222",
};

const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: "0.8rem",
};

const headerRowStyle: React.CSSProperties = {
  borderBottom: "1px solid #333",
  color: "#888",
};

const rowStyle: React.CSSProperties = {
  borderBottom: "1px solid #1a1a1a",
};

const cellStyle: React.CSSProperties = {
  padding: "0.4rem",
};

const thLeft: React.CSSProperties = {
  textAlign: "left",
  padding: "0.5rem",
};

const thRight: React.CSSProperties = {
  textAlign: "right",
  padding: "0.5rem",
};
