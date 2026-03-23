import type { Bar, OracleTapConfig } from "../core/types.js";

export class OracleTap {
  constructor(private config: OracleTapConfig) {}

  async getLatestBar(symbol: string): Promise<Bar> {
    const feedId = this.config.symbols[symbol];
    if (!feedId) throw new Error(`Unknown symbol: ${symbol}`);

    const url = `https://hermes.pyth.network/v2/updates/price/latest?ids[]=${feedId}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Pyth fetch failed: ${res.status}`);
    const data = await res.json();
    const priceData = data.parsed[0].price;
    const price = Number(priceData.price) * Math.pow(10, priceData.expo);

    return { ts: Date.now(), o: price, h: price, l: price, c: price, vol: 0 };
  }

  async getBars(symbol: string, limit: number): Promise<Bar[]> {
    const bar = await this.getLatestBar(symbol);
    return [bar];
  }
}
