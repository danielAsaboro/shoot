import WebSocket from "ws";
import { EventEmitter } from "node:events";
import { parseUsd } from "./parse-usd.ts";
import { upsertTradeEvent } from "../db/queries.ts";
import { fetchPositions } from "./client.ts";

// ── Types ────────────────────────────────────────────────────────────────────

export interface DecodedClosePosition {
  owner: string;
  position: string;
  custodyMint: string;
  side: string;
  sizeUsd: string;
  price: string;
  collateralAmountUsd: string;
  profitUsd: string;
  lossUsd: string;
  netPnl: string;
  borrowFeeUsd: string;
  exitFeeUsd: string;
  positionId: string;
  percentageClosed: string;
}

export interface ClosePositionMessage {
  type: "close_position";
  filter: string;
  timestamp: number;
  raw: {
    signature: string;
    slot: string;
    logs: string[];
    err: unknown;
  };
  decoded: DecodedClosePosition;
}

export interface ParsedTradeEvent {
  wallet: string;
  positionPubkey: string;
  custodyMint: string;
  side: string;
  sizeUsd: number;
  price: number;
  collateralUsd: number;
  profitUsd: number;
  lossUsd: number;
  netPnl: number;
  borrowFeeUsd: number;
  exitFeeUsd: number;
  positionId: string;
  percentageClosed: string;
  txSignature: string;
  slot: string;
  closedAt: Date;
}

// ── Consumer ─────────────────────────────────────────────────────────────────

export class AdrenaWsConsumer extends EventEmitter {
  private static instance: AdrenaWsConsumer | null = null;
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectDelay = 30_000;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private running = false;

  static getInstance(): AdrenaWsConsumer {
    if (!AdrenaWsConsumer.instance) {
      AdrenaWsConsumer.instance = new AdrenaWsConsumer();
    }
    return AdrenaWsConsumer.instance;
  }

  private getWsUrl(): string {
    const host =
      process.env.ADRENA_WS_HOST ??
      "adrena-competition-service.onrender.com";
    const key = process.env.ADRENA_API_KEY;
    if (!key) throw new Error("ADRENA_API_KEY is not set");
    return `wss://${host}/${key}`;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.connect();
  }

  stop(): void {
    this.running = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  private connect(): void {
    if (!this.running) return;

    const url = this.getWsUrl();
    console.log(`[WS] Connecting to ${url.replace(/\/[^/]+$/, "/<KEY>")}...`);

    this.ws = new WebSocket(url);

    this.ws.on("open", () => {
      console.log("[WS] Connected to Adrena competition service");
      this.reconnectAttempts = 0;
      this.backfillFromRest().catch((err) =>
        console.error("[WS] Backfill failed:", err)
      );
    });

    this.ws.on("message", (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === "close_position") {
          this.handleClosePosition(msg as ClosePositionMessage);
        }
      } catch (err) {
        console.error("[WS] Failed to parse message:", err);
      }
    });

    this.ws.on("close", (code, reason) => {
      console.log(
        `[WS] Disconnected (code=${code}, reason=${reason.toString()})`
      );
      this.ws = null;
      this.scheduleReconnect();
    });

    this.ws.on("error", (err) => {
      console.error("[WS] Error:", err.message);
      // 'close' event will fire after error, triggering reconnect
    });
  }

  private scheduleReconnect(): void {
    if (!this.running) return;

    const delay = Math.min(
      1000 * Math.pow(2, this.reconnectAttempts),
      this.maxReconnectDelay
    );
    this.reconnectAttempts++;

    console.log(`[WS] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})...`);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  private async handleClosePosition(msg: ClosePositionMessage): Promise<void> {
    const d = msg.decoded;

    const parsed: ParsedTradeEvent = {
      wallet: d.owner,
      positionPubkey: d.position,
      custodyMint: d.custodyMint,
      side: d.side,
      sizeUsd: parseUsd(d.sizeUsd),
      price: parseUsd(d.price),
      collateralUsd: parseUsd(d.collateralAmountUsd),
      profitUsd: parseUsd(d.profitUsd),
      lossUsd: parseUsd(d.lossUsd),
      netPnl: parseUsd(d.netPnl),
      borrowFeeUsd: parseUsd(d.borrowFeeUsd),
      exitFeeUsd: parseUsd(d.exitFeeUsd),
      positionId: d.positionId,
      percentageClosed: d.percentageClosed,
      txSignature: msg.raw.signature,
      slot: msg.raw.slot,
      closedAt: new Date(msg.timestamp),
    };

    // Persist to database
    try {
      await upsertTradeEvent(parsed);
    } catch (err) {
      console.error("[WS] Failed to persist trade event:", err);
    }

    // Emit for SSE forwarding
    this.emit("trade-closed", parsed);
  }

  /**
   * Backfill closed positions from the REST API on connect/reconnect.
   * Fetches enrolled wallets' positions and upserts any closed ones
   * that may have been missed during WS downtime.
   */
  private async backfillFromRest(): Promise<void> {
    // Load enrolled wallets from database
    let enrolledWallets: string[];
    try {
      const { getActiveCohorts, getEnrolledWalletsForCohort } = await import("@/lib/db/queries");
      const cohorts = await getActiveCohorts();
      const walletsPerCohort = await Promise.all(
        cohorts.map((c) => getEnrolledWalletsForCohort(c.id))
      );
      enrolledWallets = [...new Set(walletsPerCohort.flat())];
    } catch {
      console.log("[WS] Could not load cohorts from database, skipping backfill");
      return;
    }

    if (enrolledWallets.length === 0) return;

    console.log(`[WS] Backfilling positions for ${enrolledWallets.length} enrolled wallet(s)...`);
    let backfilled = 0;

    for (const wallet of enrolledWallets) {
      try {
        const positions = await fetchPositions(wallet);
        const closed = positions.filter(
          (p) => (p.status === "close" || p.status === "liquidate") && p.exit_date && p.pnl !== null
        );

        for (const pos of closed) {
          try {
            await upsertTradeEvent({
              wallet,
              positionPubkey: pos.pubkey,
              custodyMint: pos.token_account_mint,
              side: pos.side === "long" ? "Long" : "Short",
              sizeUsd: pos.entry_size * pos.entry_price,
              price: pos.exit_price ?? pos.entry_price,
              collateralUsd: pos.collateral_amount,
              profitUsd: pos.pnl! > 0 ? pos.pnl! : 0,
              lossUsd: pos.pnl! < 0 ? Math.abs(pos.pnl!) : 0,
              netPnl: pos.pnl!,
              borrowFeeUsd: 0,
              exitFeeUsd: pos.fees,
              positionId: String(pos.position_id),
              percentageClosed: "100.00%",
              slot: undefined,
              closedAt: new Date(pos.exit_date!),
            });
            backfilled++;
          } catch {
            // Duplicate — already exists, skip
          }
        }
      } catch {
        console.warn(`[WS] Failed to backfill wallet ${wallet}`);
      }
    }

    console.log(`[WS] Backfill complete: ${backfilled} trade event(s) upserted`);
  }
}
