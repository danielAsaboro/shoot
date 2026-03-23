"use client";

interface Trade {
  wallet: string;
  market: string;
  side: string;
  pnl: number;
  pnlPercent: number;
  closedAt: string;
}

interface LiveTradeFeedProps {
  trades: Trade[];
}

function truncateWallet(wallet: string): string {
  if (wallet.length <= 8) return wallet;
  return `${wallet.slice(0, 4)}...${wallet.slice(-4)}`;
}

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatPnl(value: number): string {
  const sign = value >= 0 ? "+" : "";
  return `${sign}$${Math.abs(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatPnlPercent(value: number): string {
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

export default function LiveTradeFeed({ trades }: LiveTradeFeedProps) {
  const visible = trades.slice(0, 10);

  return (
    <div className="rounded-[4px] border border-[var(--border-default)] bg-[#0a0a0a]">
      <div className="px-4 pt-4 pb-3">
        <h3 className="font-display text-lg font-semibold uppercase tracking-[0.08em] text-[var(--accent)]">
          LIVE TRADE FEED
        </h3>
      </div>

      <div className="max-h-[28rem] overflow-y-auto scrollbar-thin scrollbar-track-[#050505] scrollbar-thumb-[#1a1a1a]">
        {visible.length === 0 && (
          <div className="border-t border-[var(--border-default)] px-4 py-8 text-center">
            <p className="font-mono text-sm text-[var(--text-secondary)]">
              NO RECENT TRADES
            </p>
          </div>
        )}

        {visible.map((trade, idx) => {
          const isLong = trade.side.toLowerCase() === "long";
          const isPositive = trade.pnl >= 0;

          return (
            <div
              key={`${trade.wallet}-${trade.closedAt}-${idx}`}
              className="stagger-reveal flex items-center justify-between border-b border-[var(--border-default)] px-4 py-2.5 text-sm"
            >
              {/* Left: wallet + market + side */}
              <div className="flex items-center gap-3">
                <span className="font-mono text-[var(--text-secondary)]">
                  {truncateWallet(trade.wallet)}
                </span>
                <span className="text-[var(--text-tertiary)]">
                  {trade.market}
                </span>
                <span
                  className={`rounded-[2px] px-1.5 py-0.5 text-xs font-semibold uppercase ${
                    isLong
                      ? "bg-[rgba(0,255,135,0.1)] text-[#00FF87]"
                      : "bg-[rgba(255,61,61,0.1)] text-[#FF3D3D]"
                  }`}
                >
                  {trade.side}
                </span>
              </div>

              {/* Right: PnL + time */}
              <div className="flex items-center gap-3">
                <span
                  className={`font-mono font-semibold ${
                    isPositive ? "text-[#00FF87]" : "text-[#FF3D3D]"
                  }`}
                >
                  {formatPnl(trade.pnl)}
                </span>
                <span
                  className={`text-xs ${
                    isPositive ? "text-[#00FF87]/70" : "text-[#FF3D3D]/70"
                  }`}
                >
                  {formatPnlPercent(trade.pnlPercent)}
                </span>
                <span className="text-xs text-[var(--text-tertiary)]">
                  {timeAgo(trade.closedAt)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
