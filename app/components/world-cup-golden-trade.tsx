"use client";

import type { GoldenTrade } from "@/lib/world-cup/types";

export function WorldCupGoldenTrade({ trade }: { trade: GoldenTrade }) {
  return (
    <div
      className="border p-4"
      style={{
        background:
          "linear-gradient(135deg, rgba(0,240,255,0.06), rgba(0,240,255,0.02))",
        borderColor: "rgba(0,240,255,0.25)",
        borderRadius: "4px",
        boxShadow: "0 0 30px rgba(0,240,255,0.08)",
      }}
    >
      <div className="flex items-center gap-2 mb-3">
        <span
          className="text-sm font-bold tracking-wider"
          style={{
            color: "#BFFF00",
            fontFamily: "var(--font-display)",
            letterSpacing: "0.15em",
          }}
        >
          GOLDEN BOOT
        </span>
        <div>
          <p
            className="text-xs font-bold text-white"
            style={{ fontFamily: "var(--font-sans)" }}
          >
            Tournament&apos;s Best Single Trade
          </p>
        </div>
      </div>

      <div
        className="border bg-black/20 p-3"
        style={{
          borderRadius: "4px",
          borderColor: "rgba(0,240,255,0.15)",
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p
              className="text-sm font-bold text-white"
              style={{ fontFamily: "var(--font-sans)" }}
            >
              {trade.alias}
            </p>
            <div className="mt-1 flex items-center gap-2">
              <span
                className="px-2 py-0.5 text-[10px] font-bold"
                style={{
                  borderRadius: "2px",
                  background:
                    trade.direction === "long"
                      ? "rgba(0,255,135,0.15)"
                      : "rgba(255,61,61,0.15)",
                  color: trade.direction === "long" ? "#00FF87" : "#FF3D3D",
                  fontFamily: "var(--font-display)",
                }}
              >
                {trade.direction.toUpperCase()}
              </span>
              <span
                className="text-xs text-white/50"
                style={{ fontFamily: "var(--font-sans)" }}
              >
                {trade.market}
              </span>
              <span
                className="text-[10px] text-white/30"
                style={{ fontFamily: "var(--font-mono)" }}
              >
                {trade.leverage}x
              </span>
            </div>
          </div>
          <div className="text-right">
            <p
              className="text-xl font-bold"
              style={{ fontFamily: "var(--font-mono)", color: "#BFFF00" }}
            >
              ${trade.pnlUsd.toLocaleString()}
            </p>
            <p
              className="text-xs font-bold"
              style={{ fontFamily: "var(--font-mono)", color: "#00FF87" }}
            >
              +{trade.pnlPercent.toFixed(1)}%
            </p>
          </div>
        </div>
      </div>

      <p
        className="mt-2 text-[10px] text-white/30 text-center"
        style={{ fontFamily: "var(--font-mono)" }}
      >
        {trade.matchContext}
      </p>
    </div>
  );
}
