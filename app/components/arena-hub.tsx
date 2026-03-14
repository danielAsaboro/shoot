"use client";

import { useSafePrivy as usePrivy, useSafeWallets as useWallets } from "@/app/hooks/use-safe-privy";
import { useState } from "react";
import { CompetitionHub } from "./competition-hub";
import { WorldCupPanel } from "./world-cup-panel";
import { ErrorBoundary } from "./error-boundary";
import { LiveFooter } from "./live-footer";
import { AbstractBackground } from "./abstract-background";

type ArenaTab = "challenges" | "worldcup";

export function ArenaHub() {
  const { ready, authenticated, login, logout, user } = usePrivy();
  const { wallets } = useWallets();
  const [activeTab, setActiveTab] = useState<ArenaTab>("challenges");

  const solanaWallet = wallets[0];
  const walletAddress = solanaWallet?.address;
  const shortAddress = walletAddress
    ? `${walletAddress.slice(0, 4)}...${walletAddress.slice(-4)}`
    : null;

  const displayName =
    user?.email?.address ??
    user?.google?.name ??
    (user?.twitter?.username ? `@${user.twitter.username}` : null) ??
    shortAddress ??
    "Connected";

  return (
    <div className="competition-shell">
      <AbstractBackground />
      <main className="relative z-10 mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-6 px-4 py-0 pb-8 sm:px-6 lg:px-8">
        {/* ── Broadcast Header ──────────────────────────────────────── */}
        <header className="arena-header">
          <div className="arena-logo">
            <span>ADRENA SHOOT</span>
          </div>

          {/* Center: LIVE indicator */}
          <div className="flex items-center gap-2">
            <span
              className="inline-block h-2 w-2 animate-live-blink"
              style={{ backgroundColor: "#FF3D3D", borderRadius: "1px" }}
            />
            <span
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "0.72rem",
                fontWeight: 700,
                letterSpacing: "0.15em",
                textTransform: "uppercase" as const,
                color: "#FF3D3D",
              }}
            >
              LIVE
            </span>
          </div>

          {/* Right side: auth */}
          <div className="flex items-center gap-3">
            {!ready ? (
              <span className="pill opacity-50">Loading...</span>
            ) : authenticated ? (
              <div className="flex items-center gap-3">
                <div className="hidden flex-col items-end sm:flex">
                  <span
                    style={{
                      fontFamily: "var(--font-sans)",
                      fontSize: "0.8rem",
                      fontWeight: 600,
                      color: "var(--text-primary)",
                    }}
                  >
                    {displayName}
                  </span>
                  {shortAddress && displayName !== shortAddress && (
                    <span
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: "0.65rem",
                        color: "var(--text-tertiary)",
                      }}
                    >
                      {shortAddress}
                    </span>
                  )}
                </div>
                <span className="pill pill-connected">Connected</span>
                <button
                  type="button"
                  onClick={() => void logout()}
                  className="secondary-button py-2 px-4 text-xs"
                >
                  Sign out
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => void login()}
                className="action-button"
              >
                Sign in
              </button>
            )}
          </div>
        </header>

        {/* ── Tab bar: broadcast navigation ─────────────────────────── */}
        <nav className="tab-bar" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "challenges"}
            onClick={() => setActiveTab("challenges")}
            className={`tab-btn ${activeTab === "challenges" ? "tab-btn-active" : ""}`}
          >
            Prop Challenges
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "worldcup"}
            onClick={() => setActiveTab("worldcup")}
            className={`tab-btn ${activeTab === "worldcup" ? "tab-btn-active" : ""}`}
          >
            World Cup
          </button>
        </nav>

        {/* ── Tab panels ───────────────────────────────────────────── */}
        <div className="animate-wipe-in-left">
          {activeTab === "challenges" ? (
            <ErrorBoundary label="Prop Challenges">
              <CompetitionHub />
            </ErrorBoundary>
          ) : (
            <ErrorBoundary label="World Cup">
              <WorldCupPanel />
            </ErrorBoundary>
          )}
        </div>
      </main>
      <LiveFooter />
    </div>
  );
}
