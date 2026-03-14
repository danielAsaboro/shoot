"use client";

import { useEffect, useRef, useState } from "react";

interface Asset {
  symbol: string;
  label: string;
  price: number | null;
  decimals: number;
}

interface Props {
  assets: Asset[];
}

function fmtPrice(price: number | null, decimals: number): string {
  if (price === null) return "—";
  if (decimals === 8) {
    // BONK — show in micro: e.g. 0.00002134 → "$0.000021"
    return `$${price.toFixed(6)}`;
  }
  return `$${price.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}

export function PriceAnnouncement({ assets }: Props) {
  const [activeIdx, setActiveIdx] = useState(0);
  const [phase, setPhase] = useState<"enter" | "hold" | "exit">("enter");
  const prevPrices = useRef<Record<string, number | null>>({});
  const [flash, setFlash] = useState<Record<string, "up" | "down" | null>>({});

  // detect price changes for flash color
  useEffect(() => {
    const next: Record<string, "up" | "down" | null> = {};
    for (const a of assets) {
      const prev = prevPrices.current[a.symbol];
      if (prev !== undefined && a.price !== null && prev !== null) {
        if (a.price > prev) next[a.symbol] = "up";
        else if (a.price < prev) next[a.symbol] = "down";
        else next[a.symbol] = null;
      } else {
        next[a.symbol] = null;
      }
      prevPrices.current[a.symbol] = a.price;
    }
    setFlash(next);
    const id = setTimeout(() => setFlash({}), 1200);
    return () => clearTimeout(id);
  }, [assets]);

  // cycle through assets
  useEffect(() => {
    if (assets.length === 0) return;

    const ENTER = 280;
    const HOLD = 2200;
    const EXIT = 260;

    let timeout: ReturnType<typeof setTimeout>;

    function runCycle() {
      setPhase("enter");
      timeout = setTimeout(() => {
        setPhase("hold");
        timeout = setTimeout(() => {
          setPhase("exit");
          timeout = setTimeout(() => {
            setActiveIdx((i) => (i + 1) % assets.length);
            runCycle();
          }, EXIT);
        }, HOLD);
      }, ENTER);
    }

    runCycle();
    return () => clearTimeout(timeout);
  }, [assets.length]);

  if (assets.length === 0) return null;

  const current = assets[activeIdx];
  const dir = flash[current.symbol];
  const priceColor =
    dir === "up"
      ? "#00FF87"
      : dir === "down"
        ? "#FF3D3D"
        : "var(--foreground)";

  const translateY =
    phase === "enter" ? "translateY(110%)" : phase === "exit" ? "translateY(-110%)" : "translateY(0)";

  const opacity = phase === "hold" ? 1 : 0.15;

  return (
    <div
      style={{
        position: "relative",
        width: "13rem",
        height: "100%",
        overflow: "hidden",
        flexShrink: 0,
        borderLeft: "1px solid rgba(240,240,240,0.1)",
      }}
    >
      {/* Scrolling price row */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
          padding: "0 0.85rem",
          transform: translateY,
          opacity,
          transition: `transform 220ms cubic-bezier(0.4,0,0.2,1), opacity 180ms ease`,
        }}
      >
        {/* Asset label */}
        <span
          style={{
            fontFamily: "var(--font-display)",
            fontSize: "0.72rem",
            fontWeight: 700,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "var(--accent)",
            flexShrink: 0,
          }}
        >
          {current.label}
        </span>

        {/* Separator */}
        <span
          style={{
            display: "inline-block",
            width: "3px",
            height: "3px",
            borderRadius: "1px",
            backgroundColor: "rgba(240,240,240,0.3)",
            flexShrink: 0,
          }}
        />

        {/* Price */}
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "0.75rem",
            fontWeight: 600,
            fontVariantNumeric: "tabular-nums",
            color: priceColor,
            transition: "color 400ms ease",
            whiteSpace: "nowrap",
          }}
        >
          {fmtPrice(current.price, current.decimals)}
        </span>

        {/* Up/down arrow */}
        {dir && (
          <span
            style={{
              fontSize: "0.6rem",
              color: dir === "up" ? "#00FF87" : "#FF3D3D",
              flexShrink: 0,
            }}
          >
            {dir === "up" ? "▲" : "▼"}
          </span>
        )}
      </div>

      {/* Right fade / cutoff */}
      <div
        style={{
          position: "absolute",
          right: 0,
          top: 0,
          bottom: 0,
          width: "2rem",
          background: "linear-gradient(to left, rgba(5,5,5,1), transparent)",
          zIndex: 2,
          pointerEvents: "none",
        }}
      />
    </div>
  );
}
