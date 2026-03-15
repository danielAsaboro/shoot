"use client";

import { generateEquityPath } from "@/lib/competition/equity-curve";

interface EquityDetailChartProps {
  points: number[];
  highWaterMark?: number;
  startingEquity?: number;
  width?: number;
  height?: number;
}

/**
 * Larger P&L equity chart for the active challenge detail view.
 * Renders filled area (green above / red below starting equity),
 * dashed high-water-mark line, solid baseline, Y-axis labels, and
 * rough X-axis time indicators.
 */
export function EquityDetailChart({
  points,
  highWaterMark,
  startingEquity = 0,
  width = 400,
  height = 200,
}: EquityDetailChartProps) {
  if (points.length < 2) return null;

  const padding = 4;
  const labelWidth = 48;
  const xLabelHeight = 18;
  const chartW = width - labelWidth - padding;
  const chartH = height - xLabelHeight - padding * 2;
  const offsetX = labelWidth;

  // Compute data bounds
  const dataMin = Math.min(...points);
  const dataMax = Math.max(...points);
  const hwm = highWaterMark ?? dataMax;
  const rangeMin = Math.min(dataMin, startingEquity, hwm);
  const rangeMax = Math.max(dataMax, startingEquity, hwm);
  const range = rangeMax - rangeMin || 1;

  // Map a value to Y coordinate within the chart area
  function yOf(v: number): number {
    return padding + chartH - ((v - rangeMin) / range) * chartH;
  }

  // Map an index to X coordinate
  function xOf(i: number): number {
    return offsetX + (i / (points.length - 1)) * chartW;
  }

  // Build the equity line path
  const { path: equityPath } = generateEquityPath(points, chartW, chartH);

  // Re-derive coordinates so we can build the fill areas ourselves
  const coords = points.map((v, i) => ({
    x: xOf(i),
    y: yOf(v),
  }));

  const linePath = coords
    .map((c, i) => `${i === 0 ? "M" : "L"}${c.x.toFixed(1)},${c.y.toFixed(1)}`)
    .join(" ");

  const baselineY = yOf(startingEquity);

  // Filled area: close the path back along the baseline
  const firstX = coords[0].x.toFixed(1);
  const lastX = coords[coords.length - 1].x.toFixed(1);
  const fillPath = `${linePath} L${lastX},${baselineY.toFixed(1)} L${firstX},${baselineY.toFixed(1)} Z`;

  // Determine overall direction
  const lastPoint = points[points.length - 1];
  const isPositive = lastPoint >= startingEquity;

  // High-water-mark Y
  const hwmY = yOf(hwm);

  // Y-axis labels
  const yLabels: Array<{ value: number; y: number }> = [
    { value: rangeMax, y: padding },
    { value: startingEquity, y: baselineY },
    { value: rangeMin, y: padding + chartH },
  ];

  // X-axis time indicators (evenly spaced labels)
  const xTickCount = Math.min(5, points.length);
  const xTicks: Array<{ label: string; x: number }> = [];
  for (let t = 0; t < xTickCount; t++) {
    const idx = Math.round((t / (xTickCount - 1)) * (points.length - 1));
    const pct = Math.round((idx / (points.length - 1)) * 100);
    xTicks.push({ label: `${pct}%`, x: xOf(idx) });
  }

  // Format currency-like labels
  function fmtLabel(v: number): string {
    if (Math.abs(v) >= 1000) return `${(v / 1000).toFixed(1)}k`;
    return v.toFixed(0);
  }

  return (
    <div className="relative">
      <svg
        width="100%"
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="xMidYMid meet"
        className="overflow-visible"
      >
        {/* Gradient definitions for fill */}
        <defs>
          <linearGradient id="eq-fill-green" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#34d399" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#34d399" stopOpacity="0.02" />
          </linearGradient>
          <linearGradient id="eq-fill-red" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ef4444" stopOpacity="0.02" />
            <stop offset="100%" stopColor="#ef4444" stopOpacity="0.25" />
          </linearGradient>
          <clipPath id="eq-clip-above">
            <rect x={offsetX} y={0} width={chartW} height={baselineY} />
          </clipPath>
          <clipPath id="eq-clip-below">
            <rect x={offsetX} y={baselineY} width={chartW} height={chartH - baselineY + padding * 2} />
          </clipPath>
        </defs>

        {/* Filled area above baseline (green) */}
        <path
          d={fillPath}
          fill="url(#eq-fill-green)"
          clipPath="url(#eq-clip-above)"
        />

        {/* Filled area below baseline (red) */}
        <path
          d={fillPath}
          fill="url(#eq-fill-red)"
          clipPath="url(#eq-clip-below)"
        />

        {/* Starting equity baseline (solid thin) */}
        <line
          x1={offsetX}
          y1={baselineY}
          x2={offsetX + chartW}
          y2={baselineY}
          stroke="rgba(255,255,255,0.2)"
          strokeWidth="1"
        />

        {/* High-water-mark line (dashed) */}
        <line
          x1={offsetX}
          y1={hwmY}
          x2={offsetX + chartW}
          y2={hwmY}
          stroke="rgba(245,158,11,0.4)"
          strokeWidth="1"
          strokeDasharray="4 3"
        />

        {/* Equity curve line */}
        <path
          d={linePath}
          fill="none"
          stroke={isPositive ? "#34d399" : "#ef4444"}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Y-axis labels */}
        {yLabels.map((lbl) => (
          <text
            key={`y-${lbl.value}`}
            x={offsetX - 6}
            y={lbl.y + 3}
            textAnchor="end"
            fill="rgba(255,255,255,0.45)"
            fontSize="9"
            fontFamily="monospace"
          >
            {fmtLabel(lbl.value)}
          </text>
        ))}

        {/* HWM label */}
        <text
          x={offsetX + chartW + 2}
          y={hwmY + 3}
          textAnchor="start"
          fill="rgba(245,158,11,0.6)"
          fontSize="8"
          fontFamily="monospace"
        >
          HWM
        </text>

        {/* X-axis labels */}
        {xTicks.map((tick) => (
          <text
            key={`x-${tick.label}`}
            x={tick.x}
            y={height - 2}
            textAnchor="middle"
            fill="rgba(255,255,255,0.3)"
            fontSize="8"
            fontFamily="monospace"
          >
            {tick.label}
          </text>
        ))}
      </svg>
    </div>
  );
}
