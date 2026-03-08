/**
 * Parse a dollar-formatted string from the Adrena competition service.
 * Handles: "$164.535338", "$0.00", "$1,234.56", "-$5.00"
 */
export function parseUsd(value: string): number {
  const cleaned = value.replace(/[$,]/g, "");
  const num = parseFloat(cleaned);
  return Number.isFinite(num) ? num : 0;
}
