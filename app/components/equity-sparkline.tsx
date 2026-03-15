"use client";

import { generateEquityPath } from "@/lib/competition/equity-curve";

interface EquitySparklineProps {
  points: number[];
  width?: number;
  height?: number;
  className?: string;
}

/**
 * Compact inline SVG sparkline for leaderboard rows.
 * Green when equity ends above starting value, red otherwise.
 */
export function EquitySparkline({
  points,
  width = 80,
  height = 32,
  className,
}: EquitySparklineProps) {
  if (points.length < 2) return null;

  const { path, startY } = generateEquityPath(points, width, height);
  const isPositive = points[points.length - 1] > points[0];
  const strokeColor = isPositive ? "#00FF87" : "#FF3D3D";

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      aria-label={`Equity sparkline: ${isPositive ? "positive" : "negative"}`}
    >
      {/* Baseline at starting equity */}
      <line
        x1={0}
        y1={startY}
        x2={width}
        y2={startY}
        stroke="rgba(255,255,255,0.1)"
        strokeWidth="0.5"
      />
      {/* Equity polyline */}
      <path
        d={path}
        fill="none"
        stroke={strokeColor}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ filter: `drop-shadow(0 0 4px ${strokeColor}66)` }}
      />
    </svg>
  );
}
