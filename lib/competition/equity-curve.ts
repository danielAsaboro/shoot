/**
 * Pure SVG path generation for equity curves.
 * Extracted from active-challenge.tsx to enable testing without TSX.
 */

export function generateEquityPath(
  points: number[],
  width: number,
  height: number,
  padding = 4
): { path: string; startY: number; hwmY: number } {
  if (points.length < 2) return { path: "", startY: height / 2, hwmY: height / 2 };

  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const usableW = width - padding * 2;
  const usableH = height - padding * 2;

  const coords = points.map((v, i) => {
    const x = padding + (i / (points.length - 1)) * usableW;
    const y = padding + usableH - ((v - min) / range) * usableH;
    return { x, y };
  });

  const d = coords.map((c, i) => `${i === 0 ? "M" : "L"}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(" ");
  const startY = padding + usableH - ((points[0] - min) / range) * usableH;
  const hwm = Math.max(...points);
  const hwmY = padding + usableH - ((hwm - min) / range) * usableH;

  return { path: d, startY, hwmY };
}
