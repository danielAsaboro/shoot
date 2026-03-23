"use client";

import type { NarrativeBeat, NarrativeSeverity } from "@/lib/world-cup/types";

const severityStyles: Record<
  NarrativeSeverity,
  {
    bg: string;
    borderColor: string;
    badgeBg: string;
    badgeColor: string;
    leftBorder: string;
  }
> = {
  legendary: {
    bg: "linear-gradient(90deg, rgba(0,240,255,0.06), rgba(191,255,0,0.03))",
    borderColor: "rgba(0,240,255,0.2)",
    badgeBg: "rgba(191,255,0,0.12)",
    badgeColor: "#BFFF00",
    leftBorder: "#BFFF00",
  },
  hype: {
    bg: "rgba(0,240,255,0.04)",
    borderColor: "rgba(0,240,255,0.15)",
    badgeBg: "rgba(0,240,255,0.12)",
    badgeColor: "#00F0FF",
    leftBorder: "#00F0FF",
  },
  normal: {
    bg: "rgba(255,255,255,0.02)",
    borderColor: "rgba(255,255,255,0.06)",
    badgeBg: "rgba(255,255,255,0.05)",
    badgeColor: "rgba(255,255,255,0.4)",
    leftBorder: "rgba(255,255,255,0.1)",
  },
};

function BeatCard({ beat }: { beat: NarrativeBeat }) {
  const style = severityStyles[beat.severity];
  const timeAgo = formatTimeAgo(beat.timestamp);

  return (
    <div
      className="border p-3 transition-all"
      style={{
        background: style.bg,
        borderColor: style.borderColor,
        borderRadius: "4px",
        borderLeft: `3px solid ${style.leftBorder}`,
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span
              className="px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider"
              style={{
                borderRadius: "2px",
                background: style.badgeBg,
                color: style.badgeColor,
                fontFamily: "var(--font-display)",
              }}
            >
              {beat.severity === "legendary"
                ? "LEGENDARY"
                : beat.severity === "hype"
                  ? "HYPE"
                  : beat.type.replace("-", " ").toUpperCase()}
            </span>
            <span
              className="text-[9px] text-white/20"
              style={{ fontFamily: "var(--font-mono)" }}
            >
              {timeAgo}
            </span>
          </div>
          <p
            className="text-xs font-bold text-white leading-5"
            style={{ fontFamily: "var(--font-sans)" }}
          >
            {beat.headline}
          </p>
          <p
            className="mt-1 text-[11px] text-white/40 leading-4"
            style={{ fontFamily: "var(--font-sans)" }}
          >
            {beat.subtext}
          </p>
        </div>
      </div>
    </div>
  );
}

function formatTimeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function WorldCupCommentary({
  beats,
  maxBeats = 12,
}: {
  beats: NarrativeBeat[];
  maxBeats?: number;
}) {
  const displayed = beats.slice(0, maxBeats);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className="text-xs font-bold tracking-wider"
            style={{
              fontFamily: "var(--font-display)",
              color: "#00F0FF",
              letterSpacing: "0.15em",
            }}
          >
            LIVE FEED
          </span>
          <div>
            <p
              className="text-[10px] uppercase tracking-wider text-white/40"
              style={{
                fontFamily: "var(--font-display)",
                letterSpacing: "0.1em",
              }}
            >
              Tournament Commentary
            </p>
          </div>
        </div>
        <span
          className="flex items-center gap-1.5 text-[10px] font-bold"
          style={{ color: "#FF3D3D", fontFamily: "var(--font-mono)" }}
        >
          <span
            className="animate-live-blink"
            style={{
              width: "6px",
              height: "6px",
              background: "#FF3D3D",
              borderRadius: "0px",
              display: "inline-block",
            }}
          />
          {beats.length} beats
        </span>
      </div>

      {/* Beat feed */}
      <div className="space-y-2">
        {displayed.map((beat, i) => (
          <BeatCard key={`${beat.type}-${i}`} beat={beat} />
        ))}
      </div>

      {beats.length > maxBeats && (
        <p
          className="text-center text-[10px] text-white/20"
          style={{ fontFamily: "var(--font-mono)" }}
        >
          +{beats.length - maxBeats} more beats
        </p>
      )}
    </div>
  );
}
