"use client";

import { useEffect, useRef, useState } from "react";
import { PriceAnnouncement } from "./price-announcement";

interface Asset {
  symbol: string;
  label: string;
  price: number | null;
  decimals: number;
}

interface FooterStats {
  aum: number | null;
  dailyVolume: number | null;
  btcPrice: number | null;
  assets: Asset[];
  fetchedAt: string;
}

function fmt(n: number | null, prefix = "$"): string {
  if (n === null) return "—";
  if (n >= 1_000_000_000) return `${prefix}${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `${prefix}${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${prefix}${(n / 1_000).toFixed(2)}K`;
  return `${prefix}${n.toFixed(2)}`;
}

function fmtBtc(n: number | null): string {
  if (n === null) return "—";
  return `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

function useRpcLatency() {
  const [latency, setLatency] = useState<number | null>(null);
  const [status, setStatus] = useState<"ok" | "slow" | "error">("ok");

  useEffect(() => {
    let cancelled = false;

    async function ping() {
      const start = performance.now();
      try {
        const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC ?? "https://api.mainnet-beta.solana.com";
        const res = await fetch(rpcUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getHealth" }),
          signal: AbortSignal.timeout(5000),
        });
        const ms = Math.round(performance.now() - start);
        if (cancelled) return;
        if (res.ok) {
          setLatency(ms);
          setStatus(ms > 800 ? "slow" : "ok");
        } else {
          setStatus("error");
        }
      } catch {
        if (!cancelled) setStatus("error");
      }
    }

    void ping();
    const id = setInterval(() => void ping(), 20_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return { latency, status };
}

function useLiveStats() {
  const [stats, setStats] = useState<FooterStats | null>(null);
  const prevRef = useRef<FooterStats | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch("/api/adrena-live/footer-stats", {
          next: { revalidate: 30 },
        });
        if (!res.ok) return;
        const data = (await res.json()) as FooterStats;
        if (!cancelled) {
          prevRef.current = data;
          setStats(data);
        }
      } catch {
        // keep stale data
      }
    }

    void load();
    const id = setInterval(() => void load(), 30_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return stats;
}

export function LiveFooter() {
  const stats = useLiveStats();
  const { latency, status: rpcStatus } = useRpcLatency();
  const [tick, setTick] = useState(false);

  // flash on new data
  useEffect(() => {
    if (!stats) return;
    setTick(true);
    const id = setTimeout(() => setTick(false), 400);
    return () => clearTimeout(id);
  }, [stats?.fetchedAt]);

  const rpcColor =
    rpcStatus === "error"
      ? "#FF3D3D"
      : rpcStatus === "slow"
        ? "#FFB800"
        : "#00FF87";

  return (
    <footer
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 50,
        height: "2rem",
        display: "flex",
        alignItems: "center",
        borderTop: "1px solid rgba(240,240,240,0.08)",
        background: "rgba(5,5,5,0.95)",
        backdropFilter: "blur(20px)",
        padding: "0 0.75rem",
        gap: 0,
        overflow: "hidden",
      }}
    >
      {/* ── Logo ───────────────────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.4rem",
          paddingRight: "0.75rem",
          borderRight: "1px solid rgba(240,240,240,0.08)",
          flexShrink: 0,
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
          <path d="M12 2L2 20h20L12 2z" fill="var(--accent)" />
        </svg>
        <span
          style={{
            fontFamily: "var(--font-display)",
            fontSize: "0.6rem",
            fontWeight: 800,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: "var(--foreground)",
          }}
        >
          SHOOT
        </span>
      </div>

      {/* ── Operational ────────────────────────────────────────────── */}
      <FooterItem>
        <span
          style={{
            display: "inline-block",
            width: "6px",
            height: "6px",
            borderRadius: "1px",
            backgroundColor: "#00FF87",
            flexShrink: 0,
          }}
          className="animate-live-blink"
        />
        <span
          style={{
            fontFamily: "var(--font-display)",
            fontSize: "0.65rem",
            fontWeight: 700,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "#00FF87",
          }}
        >
          Operational
        </span>
      </FooterItem>

      {/* ── RPC Latency ────────────────────────────────────────────── */}
      <FooterItem>
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          style={{ flexShrink: 0 }}
        >
          <path
            d="M2 12h4M18 12h4M12 2v4M12 18v4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8"
            stroke="var(--text-tertiary)"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <circle cx="12" cy="12" r="3" fill={rpcColor} />
        </svg>
        <span
          style={{
            fontFamily: "var(--font-display)",
            fontSize: "0.65rem",
            color: "var(--text-secondary)",
            letterSpacing: "0.06em",
          }}
        >
          Solana RPC
        </span>
        <span
          style={{
            display: "inline-block",
            width: "5px",
            height: "5px",
            borderRadius: "1px",
            backgroundColor: rpcColor,
            flexShrink: 0,
          }}
        />
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "0.62rem",
            color: rpcColor,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {latency !== null ? `${latency}ms` : "—"}
        </span>
      </FooterItem>

      {/* ── AUM ────────────────────────────────────────────────────── */}
      <FooterItem>
        <span
          style={{
            fontFamily: "var(--font-display)",
            fontSize: "0.6rem",
            fontWeight: 700,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "var(--text-tertiary)",
          }}
        >
          AUM
        </span>
        <span
          key={stats?.fetchedAt}
          className={tick ? "animate-data-flash" : ""}
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "0.65rem",
            color: "var(--accent)",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {fmt(stats?.aum ?? null)}
        </span>
      </FooterItem>

      {/* ── VOL ────────────────────────────────────────────────────── */}
      <FooterItem>
        <span
          style={{
            fontFamily: "var(--font-display)",
            fontSize: "0.6rem",
            fontWeight: 700,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "var(--text-tertiary)",
          }}
        >
          VOL
        </span>
        <span
          key={`vol-${stats?.fetchedAt}`}
          className={tick ? "animate-data-flash" : ""}
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "0.65rem",
            color: "var(--foreground)",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {fmt(stats?.dailyVolume ?? null)}
        </span>
      </FooterItem>

      {/* ── BTC Price ──────────────────────────────────────────────── */}
      <FooterItem>
        <span
          style={{
            fontFamily: "var(--font-display)",
            fontSize: "0.6rem",
            fontWeight: 700,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: "var(--text-tertiary)",
          }}
        >
          BTC
        </span>
        <span
          key={`btc-${stats?.fetchedAt}`}
          className={tick ? "animate-data-flash" : ""}
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "0.65rem",
            color: "var(--foreground)",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {fmtBtc(stats?.btcPrice ?? null)}
        </span>
      </FooterItem>

      {/* ── Spacer ─────────────────────────────────────────────────── */}
      <div style={{ flex: 1 }} />

      {/* ── Price announcement board ───────────────────────────────── */}
      <PriceAnnouncement assets={stats?.assets ?? []} />

      {/* ── External links ─────────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.1rem",
          paddingLeft: "0.75rem",
          borderLeft: "1px solid rgba(240,240,240,0.08)",
        }}
      >
        <FooterIconLink
          href="https://discord.gg/adrena"
          title="Discord"
          aria-label="Discord"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
            <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z" />
          </svg>
        </FooterIconLink>

        <FooterIconLink
          href="https://x.com/AdrenaProtocol"
          title="X / Twitter"
          aria-label="X"
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.741l7.737-8.835L1.254 2.25H8.08l4.253 5.622 5.91-5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
          </svg>
        </FooterIconLink>

        <FooterIconLink
          href="https://github.com/AdrenaFoundation"
          title="GitHub"
          aria-label="GitHub"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0 0 22 12.017C22 6.484 17.522 2 12 2z" />
          </svg>
        </FooterIconLink>

        <FooterIconLink
          href="https://docs.adrena.xyz"
          title="Docs"
          aria-label="Docs"
        >
          <svg
            width="11"
            height="11"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
            <polyline points="10 9 9 9 8 9" />
          </svg>
        </FooterIconLink>
      </div>
    </footer>
  );
}

function FooterItem({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "0.35rem",
        padding: "0 0.65rem",
        borderRight: "1px solid rgba(240,240,240,0.08)",
        height: "100%",
        flexShrink: 0,
      }}
    >
      {children}
    </div>
  );
}

function FooterIconLink({
  href,
  title,
  "aria-label": ariaLabel,
  children,
}: {
  href: string;
  title: string;
  "aria-label": string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={title}
      aria-label={ariaLabel}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: "1.75rem",
        height: "1.75rem",
        color: "var(--text-tertiary)",
        borderRadius: "2px",
        transition: "color 120ms ease",
      }}
      onMouseEnter={(e) =>
        (e.currentTarget.style.color = "var(--foreground)")
      }
      onMouseLeave={(e) =>
        (e.currentTarget.style.color = "var(--text-tertiary)")
      }
    >
      {children}
    </a>
  );
}
