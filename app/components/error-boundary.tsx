"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  label?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(
      `[ErrorBoundary:${this.props.label ?? "unknown"}]`,
      error,
      info.componentStack
    );
  }

  override render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div
          style={{
            borderRadius: 4,
            border: "1px solid rgba(255,61,61,0.2)",
            background: "rgba(255,61,61,0.05)",
            padding: "1.5rem",
            textAlign: "center",
          }}
        >
          <div className="mb-3 flex justify-center">
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
              <circle
                cx="16"
                cy="16"
                r="14"
                stroke="#FF3D3D"
                strokeWidth="1.5"
              />
              <path
                d="M16 9v8M16 21v2"
                stroke="#FF3D3D"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </div>
          <p
            style={{
              fontSize: "0.875rem",
              fontFamily: "var(--font-display)",
              fontWeight: 700,
              color: "#FF3D3D",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              marginBottom: "0.25rem",
            }}
          >
            {this.props.label
              ? `${this.props.label} failed to render`
              : "Something went wrong"}
          </p>
          <p className="text-xs mb-4" style={{ color: "var(--text-tertiary)" }}>
            {this.state.error?.message}
          </p>
          <button
            type="button"
            onClick={() => this.setState({ hasError: false, error: null })}
            style={{
              borderRadius: 2,
              border: "1px solid rgba(255,61,61,0.3)",
              padding: "0.5rem 1rem",
              fontFamily: "var(--font-display)",
              fontSize: "0.75rem",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: "#FF3D3D",
              background: "transparent",
              cursor: "pointer",
            }}
          >
            Retry
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

// ── Skeleton loaders ──────────────────────────────────────────────────────────

export function SkeletonRow({ cols = 5 }: { cols?: number }) {
  return (
    <div
      className="flex items-center gap-3 py-2.5"
      style={{ borderBottom: "1px solid var(--border-subtle)" }}
    >
      <div
        className="h-4 w-8 animate-pulse"
        style={{ borderRadius: 2, background: "rgba(255,255,255,0.1)" }}
      />
      <div
        className="h-4 flex-1 animate-pulse"
        style={{ borderRadius: 2, background: "rgba(255,255,255,0.1)" }}
      />
      {Array.from({ length: cols - 2 }).map((_, i) => (
        <div
          key={i}
          className="h-4 w-16 animate-pulse"
          style={{ borderRadius: 2, background: "rgba(255,255,255,0.08)" }}
        />
      ))}
    </div>
  );
}

export function LeaderboardSkeleton() {
  return (
    <div className="space-y-0">
      {Array.from({ length: 6 }).map((_, i) => (
        <SkeletonRow key={i} cols={5} />
      ))}
    </div>
  );
}

export function CardSkeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div
      className="p-4 space-y-2.5"
      style={{ borderRadius: 4, border: "1px solid var(--border-subtle)" }}
    >
      <div
        className="h-3 w-24 animate-pulse"
        style={{ borderRadius: 2, background: "rgba(255,255,255,0.1)" }}
      />
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className="h-4 animate-pulse"
          style={{
            borderRadius: 2,
            background: "rgba(255,255,255,0.1)",
            width: `${60 + i * 15}%`,
          }}
        />
      ))}
    </div>
  );
}

export function WalletNotConnected({ onLogin }: { onLogin: () => void }) {
  return (
    <div
      className="flex flex-col items-center justify-center py-12 px-6 text-center"
      style={{
        borderRadius: 4,
        border: "1px solid var(--border-default)",
        background: "rgba(255,255,255,0.02)",
      }}
    >
      <div
        className="mb-4 flex h-16 w-16 items-center justify-center"
        style={{
          borderRadius: 4,
          background: "rgba(0,240,255,0.08)",
          border: "1px solid rgba(0,240,255,0.2)",
        }}
      >
        <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
          <rect
            x="2"
            y="8"
            width="24"
            height="17"
            rx="2"
            stroke="#00F0FF"
            strokeWidth="1.5"
          />
          <path
            d="M8 8V6a6 6 0 1 1 12 0v2"
            stroke="#00F0FF"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      </div>
      <p
        className="mb-2 text-base font-bold"
        style={{
          fontFamily: "var(--font-display)",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          color: "var(--text-primary)",
        }}
      >
        Connect your wallet
      </p>
      <p
        className="mb-5 text-sm max-w-xs"
        style={{ color: "var(--text-secondary)" }}
      >
        Sign in to enter challenges, view your leaderboard position, and track
        your progress.
      </p>
      <button type="button" onClick={onLogin} className="action-button">
        Sign in with wallet
      </button>
    </div>
  );
}
