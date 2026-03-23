import type { Bar } from "../core/types.js";

/**
 * ReplayTap — deterministic bar replay for testing.
 * Advances through a pre-loaded bar sequence.
 */
export class ReplayTap {
  private cursor = 0;

  constructor(private bars: Bar[]) {}

  async getLatestBar(_symbol: string): Promise<Bar> {
    if (this.bars.length === 0) throw new Error("No bars loaded");
    return this.bars[Math.min(this.cursor, this.bars.length - 1)];
  }

  async getBars(_symbol: string, limit: number): Promise<Bar[]> {
    const end = Math.min(this.cursor + 1, this.bars.length);
    const start = Math.max(0, end - limit);
    return this.bars.slice(start, end);
  }

  advance(): void {
    this.cursor = Math.min(this.cursor + 1, this.bars.length - 1);
  }

  reset(): void {
    this.cursor = 0;
  }

  getCursor(): number {
    return this.cursor;
  }
}
