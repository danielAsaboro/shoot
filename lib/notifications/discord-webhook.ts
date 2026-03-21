/**
 * Discord Webhook Notifications
 *
 * Sends competition events to a Discord channel via webhook.
 * Configure via DISCORD_WEBHOOK_URL environment variable.
 *
 * Events:
 * - Challenge pass/fail results
 * - Funded trader promotions
 * - World Cup bracket advancement
 * - Leaderboard top-3 changes
 * - Sybil detection alerts (ops channel)
 */

// ── Configuration ───────────────────────────────────────────────────────────

function getWebhookUrl(): string | null {
  return process.env.DISCORD_WEBHOOK_URL ?? null;
}

function getOpsWebhookUrl(): string | null {
  return process.env.DISCORD_OPS_WEBHOOK_URL ?? process.env.DISCORD_WEBHOOK_URL ?? null;
}

// ── Core sender ─────────────────────────────────────────────────────────────

interface DiscordEmbed {
  title: string;
  description: string;
  color: number;
  fields?: Array<{ name: string; value: string; inline?: boolean }>;
  footer?: { text: string };
  timestamp?: string;
}

async function sendEmbed(embed: DiscordEmbed, webhookUrl?: string | null): Promise<boolean> {
  const url = webhookUrl ?? getWebhookUrl();
  if (!url) return false;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        embeds: [{ ...embed, timestamp: embed.timestamp ?? new Date().toISOString() }],
      }),
    });
    return res.ok;
  } catch (err) {
    console.warn(
      `[discord-webhook] Failed to send: ${err instanceof Error ? err.message : String(err)}`
    );
    return false;
  }
}

// ── Colors ──────────────────────────────────────────────────────────────────

const COLORS = {
  success: 0x22c55e, // green
  failure: 0xef4444, // red
  promotion: 0xf59e0b, // amber
  bracket: 0x3b82f6, // blue
  leaderboard: 0x8b5cf6, // purple
  alert: 0xdc2626, // dark red
} as const;

// ── Event senders ───────────────────────────────────────────────────────────

export async function notifyChallengeResult(data: {
  wallet: string;
  displayName: string;
  tierName: string;
  passed: boolean;
  reason: string;
  pnlPercent: number;
  maxDrawdown: number;
  cohortName: string;
}): Promise<boolean> {
  const emoji = data.passed ? "🏆" : "❌";
  return sendEmbed({
    title: `${emoji} Challenge ${data.passed ? "Passed" : "Failed"}: ${data.displayName}`,
    description: data.reason,
    color: data.passed ? COLORS.success : COLORS.failure,
    fields: [
      { name: "Tier", value: data.tierName, inline: true },
      { name: "Cohort", value: data.cohortName, inline: true },
      { name: "P&L", value: `${data.pnlPercent.toFixed(1)}%`, inline: true },
      { name: "Max DD", value: `${data.maxDrawdown.toFixed(1)}%`, inline: true },
    ],
    footer: { text: `${data.wallet.slice(0, 8)}...${data.wallet.slice(-4)}` },
  });
}

export async function notifyFundedPromotion(data: {
  wallet: string;
  displayName: string;
  fromLevel: string;
  toLevel: string;
  revenueShareBps: number;
}): Promise<boolean> {
  return sendEmbed({
    title: `🚀 Funded Trader Promotion: ${data.displayName}`,
    description: `Promoted from **${data.fromLevel}** to **${data.toLevel}**`,
    color: COLORS.promotion,
    fields: [
      { name: "New Level", value: data.toLevel, inline: true },
      { name: "Revenue Share", value: `${data.revenueShareBps} bps`, inline: true },
    ],
    footer: { text: `${data.wallet.slice(0, 8)}...${data.wallet.slice(-4)}` },
  });
}

export async function notifyBracketAdvancement(data: {
  tournamentName: string;
  division: string;
  round: string;
  advancingTraders: Array<{ displayName: string; score: number }>;
}): Promise<boolean> {
  const traderList = data.advancingTraders
    .map((t, i) => `${i + 1}. **${t.displayName}** (${t.score.toFixed(1)})`)
    .join("\n");

  return sendEmbed({
    title: `⚔️ ${data.division} — ${data.round} Complete`,
    description: `Advancing traders:\n${traderList}`,
    color: COLORS.bracket,
    fields: [
      { name: "Tournament", value: data.tournamentName, inline: true },
      { name: "Round", value: data.round, inline: true },
    ],
  });
}

export async function notifyLeaderboardChange(data: {
  cohortName: string;
  topThree: Array<{ rank: number; displayName: string; score: number; pnlPercent: number }>;
}): Promise<boolean> {
  const medals = ["🥇", "🥈", "🥉"];
  const lines = data.topThree.map(
    (t, i) => `${medals[i] ?? `${t.rank}.`} **${t.displayName}** — ${t.score.toFixed(1)} pts (${t.pnlPercent.toFixed(1)}% P&L)`
  );

  return sendEmbed({
    title: `📊 Leaderboard Update: ${data.cohortName}`,
    description: lines.join("\n"),
    color: COLORS.leaderboard,
  });
}

export async function notifySybilAlert(data: {
  cohortId: string;
  flaggedCount: number;
  clusters: Array<{ wallets: string[]; reason: string }>;
}): Promise<boolean> {
  const clusterLines = data.clusters
    .slice(0, 5) // limit to 5 clusters in notification
    .map((c) => `• ${c.wallets.length} wallets: ${c.reason}`);

  return sendEmbed(
    {
      title: `⚠️ Sybil Detection Alert`,
      description: `**${data.flaggedCount}** wallets flagged in cohort \`${data.cohortId}\`\n\n${clusterLines.join("\n")}`,
      color: COLORS.alert,
      footer: { text: "Review at /api/admin/sybil/review" },
    },
    getOpsWebhookUrl()
  );
}
