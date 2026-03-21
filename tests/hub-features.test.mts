/**
 * Tests for the full-stack completion features:
 * - Tier extraction module (tiers.ts)
 * - Schema validation (schema.sql)
 * - Quest state machine (quests.ts)
 * - Streak state machine (streaks.ts)
 * - Sybil detection (sybil-detector.ts)
 * - Equity curve path generation (active-challenge.tsx)
 * - Retry fee calculations
 * - Funded status transitions
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..");

// ── Phase 1.1: Tier extraction ──────────────────────────────────────────────

import { getTierById, getSpecialistChallenge, challengeTiers } from "../lib/competition/tiers.ts";

test("getTierById returns correct tier for valid id", () => {
  const scout = getTierById("scout");
  assert.ok(scout);
  assert.equal(scout.id, "scout");
  assert.equal(scout.entryFee, 2);
  assert.equal(scout.minCapital, 50);
});

test("getTierById returns undefined for unknown id", () => {
  const unknown = getTierById("mythic");
  assert.equal(unknown, undefined);
});

test("getSpecialistChallenge returns correct specialist", () => {
  const forex = getSpecialistChallenge("forex");
  assert.ok(forex);
  assert.equal(forex.name, "Forex Track");
  assert.ok(forex.markets.includes("EUR/USD"));
});

test("getSpecialistChallenge returns undefined for unknown type", () => {
  assert.equal(getSpecialistChallenge("bonds"), undefined);
});

test("all tiers have minCapital defined", () => {
  for (const [id, tier] of Object.entries(challengeTiers)) {
    assert.ok(tier.minCapital > 0, `${id} should have positive minCapital`);
  }
});

test("minCapital increases with tier difficulty", () => {
  assert.ok(challengeTiers.ranger.minCapital > challengeTiers.scout.minCapital);
  assert.ok(challengeTiers.veteran.minCapital > challengeTiers.ranger.minCapital);
  assert.ok(challengeTiers.elite.minCapital > challengeTiers.veteran.minCapital);
  assert.ok(challengeTiers.apex.minCapital > challengeTiers.elite.minCapital);
});

// ── Phase 1.2: Schema validation ────────────────────────────────────────────

test("schema.sql contains expected tables", () => {
  const schema = readFileSync(join(rootDir, "lib/competition/schema.sql"), "utf-8");
  assert.match(schema, /CREATE TABLE IF NOT EXISTS challenges/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS worldcup_seasons/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS worldcup_registrations/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS worldcup_matches/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS trade_events/);
});

test("schema.sql contains expected columns", () => {
  const schema = readFileSync(join(rootDir, "lib/competition/schema.sql"), "utf-8");
  // challenges table
  assert.match(schema, /wallet\s+TEXT NOT NULL/);
  assert.match(schema, /tier_id\s+TEXT NOT NULL/);
  assert.match(schema, /specialist_type/);
  assert.match(schema, /high_water_mark/);
  // trade_events table
  assert.match(schema, /asset_class\s+TEXT NOT NULL/);
  assert.match(schema, /tx_signature/);
  assert.match(schema, /challenge_id/);
});

test("schema.sql creates indexes", () => {
  const schema = readFileSync(join(rootDir, "lib/competition/schema.sql"), "utf-8");
  assert.match(schema, /CREATE INDEX IF NOT EXISTS idx_challenges_wallet/);
  assert.match(schema, /CREATE INDEX IF NOT EXISTS idx_trade_events_wallet/);
  assert.match(schema, /CREATE INDEX IF NOT EXISTS idx_wc_matches_season/);
});

// ── Phase 2.2: Retry fee ────────────────────────────────────────────────────

import { calculateRetryFee } from "../lib/competition/engine.ts";

test("retry fee at exactly 48h boundary applies discount", () => {
  const fee = calculateRetryFee(challengeTiers.elite, 48);
  assert.equal(fee, 17.5);
});

test("retry fee at 0h applies discount", () => {
  const fee = calculateRetryFee(challengeTiers.elite, 0);
  assert.equal(fee, 17.5);
});

test("retry fee at 49h returns full fee", () => {
  const fee = calculateRetryFee(challengeTiers.elite, 49);
  assert.equal(fee, 25);
});

// ── Phase 3.1: Equity curve path generation ─────────────────────────────────

import { generateEquityPath } from "../lib/competition/equity-curve.ts";

test("generateEquityPath returns valid SVG path for normal data", () => {
  const points = [100, 102, 98, 105, 103, 110];
  const { path, startY, hwmY } = generateEquityPath(points, 480, 80);
  assert.ok(path.startsWith("M"), "Path should start with M command");
  assert.ok(path.includes("L"), "Path should contain L commands");
  assert.ok(typeof startY === "number");
  assert.ok(typeof hwmY === "number");
  assert.ok(hwmY <= startY, "HWM should be at or above start (lower Y = higher on screen)");
});

test("generateEquityPath returns empty for single point", () => {
  const { path } = generateEquityPath([100], 480, 80);
  assert.equal(path, "");
});

// ── Phase 5.1: Quest state machine ──────────────────────────────────────────

import { QuestEngine, QUEST_CATALOG } from "../lib/competition/quests.ts";

test("QuestEngine initializes with all quests at zero progress", () => {
  const engine = new QuestEngine();
  engine.reset();
  const quests = engine.getActiveQuests();
  assert.equal(quests.length, QUEST_CATALOG.length);
  for (const q of quests) {
    assert.equal(q.progress, 0);
  }
});

test("QuestEngine increments progress on matching events", () => {
  const engine = new QuestEngine();
  engine.reset();
  engine.checkProgress("challenge_start");
  const quests = engine.getActiveQuests();
  const firstChallenge = quests.find(q => q.label === "First Challenge");
  assert.ok(firstChallenge);
  assert.equal(firstChallenge.progress, 1);
});

test("QuestEngine does not exceed target", () => {
  const engine = new QuestEngine();
  engine.reset();
  // First Challenge target is 1
  engine.checkProgress("challenge_start");
  engine.checkProgress("challenge_start");
  const quests = engine.getActiveQuests();
  const firstChallenge = quests.find(q => q.label === "First Challenge");
  assert.ok(firstChallenge);
  assert.equal(firstChallenge.progress, 1);
});

test("QuestEngine tracks completed quests", () => {
  const engine = new QuestEngine();
  engine.reset();
  engine.checkProgress("challenge_start");
  const completed = engine.getCompletedQuests();
  assert.ok(completed.some(q => q.label === "First Challenge"));
});

test("QuestEngine tracks Comeback Trail on pass-after-fail", () => {
  const engine = new QuestEngine();
  engine.reset();
  engine.checkProgress("challenge_pass_after_fail");
  const quests = engine.getActiveQuests();
  const comeback = quests.find(q => q.label === "Comeback Trail");
  assert.ok(comeback);
  assert.equal(comeback.progress, 1);
});

test("QuestEngine reset clears all progress", () => {
  const engine = new QuestEngine();
  engine.checkProgress("challenge_start");
  engine.reset();
  const quests = engine.getActiveQuests();
  for (const q of quests) {
    assert.equal(q.progress, 0);
  }
});

// ── Phase 5.2: Streak state machine ─────────────────────────────────────────

import { StreakTracker, getMultiplier } from "../lib/competition/streaks.ts";

test("StreakTracker starts at 0", () => {
  const tracker = new StreakTracker();
  tracker.reset();
  assert.equal(tracker.getStreak(), 0);
});

test("StreakTracker records first activity as streak 1", async () => {
  const tracker = new StreakTracker();
  tracker.reset();
  const days = await tracker.recordActivity(new Date("2026-03-19T12:00:00Z"));
  assert.equal(days, 1);
});

test("StreakTracker extends streak on consecutive days", async () => {
  const tracker = new StreakTracker();
  tracker.reset();
  await tracker.recordActivity(new Date("2026-03-19T12:00:00Z"));
  const days = await tracker.recordActivity(new Date("2026-03-20T08:00:00Z"));
  assert.equal(days, 2);
});

test("StreakTracker resets on gap days", async () => {
  const tracker = new StreakTracker();
  tracker.reset();
  await tracker.recordActivity(new Date("2026-03-19T12:00:00Z"));
  // Skip a day
  const days = await tracker.recordActivity(new Date("2026-03-21T12:00:00Z"));
  assert.equal(days, 1);
});

test("StreakTracker same-day activity does not increment", async () => {
  const tracker = new StreakTracker();
  tracker.reset();
  await tracker.recordActivity(new Date("2026-03-19T08:00:00Z"));
  const days = await tracker.recordActivity(new Date("2026-03-19T20:00:00Z"));
  assert.equal(days, 1);
});

test("getMultiplier returns correct bands", () => {
  assert.equal(getMultiplier(0), 1);
  assert.equal(getMultiplier(1), 1);
  assert.equal(getMultiplier(2), 1.5);
  assert.equal(getMultiplier(3), 2);
  assert.equal(getMultiplier(4), 2);
  assert.equal(getMultiplier(5), 3);
  assert.equal(getMultiplier(9), 3);
  assert.equal(getMultiplier(10), 5);
  assert.equal(getMultiplier(100), 5);
});

test("StreakTracker checkWarning returns correct states", () => {
  const tracker = new StreakTracker();
  tracker.reset();
  assert.equal(tracker.checkWarning(), "broken");

  tracker.recordActivity(new Date("2026-03-19T12:00:00Z"));
  assert.equal(tracker.checkWarning(new Date("2026-03-19T18:00:00Z")), "alive");
  assert.equal(tracker.checkWarning(new Date("2026-03-20T12:00:00Z")), "warning");
  assert.equal(tracker.checkWarning(new Date("2026-03-21T12:00:00Z")), "broken");
});

test("StreakTracker isUnbreakable at 10+ days", () => {
  const tracker = new StreakTracker();
  tracker.reset();
  // Simulate 10 consecutive days
  for (let i = 0; i < 10; i++) {
    tracker.recordActivity(new Date(`2026-03-${String(10 + i).padStart(2, "0")}T12:00:00Z`));
  }
  assert.equal(tracker.isUnbreakable(), true);
  assert.equal(tracker.getMultiplier(), 5);
});

// ── Phase 6.1: Sybil detection ──────────────────────────────────────────────

import { detectSybilClusters, isWalletFlagged } from "../lib/competition/sybil-detector.ts";
import type { WalletInfo } from "../lib/competition/sybil-detector.ts";

test("detectSybilClusters finds cluster from same funding source", () => {
  const now = Date.now();
  const wallets: WalletInfo[] = [
    { address: "wallet1", fundingSource: "sourceA", fundedAt: now, entryTimestamp: now + 1000 },
    { address: "wallet2", fundingSource: "sourceA", fundedAt: now + 30_000, entryTimestamp: now + 31_000 },
    { address: "wallet3", fundingSource: "sourceA", fundedAt: now + 60_000, entryTimestamp: now + 61_000 },
  ];
  const clusters = detectSybilClusters(wallets);
  assert.equal(clusters.length, 1);
  assert.equal(clusters[0].size, 3);
  assert.equal(clusters[0].flagged, true);
});

test("detectSybilClusters does not flag small clusters", () => {
  const now = Date.now();
  const wallets: WalletInfo[] = [
    { address: "wallet1", fundingSource: "sourceA", fundedAt: now, entryTimestamp: now },
    { address: "wallet2", fundingSource: "sourceA", fundedAt: now + 30_000, entryTimestamp: now + 31_000 },
  ];
  const clusters = detectSybilClusters(wallets);
  assert.equal(clusters.length, 1);
  assert.equal(clusters[0].flagged, false);
  assert.equal(clusters[0].confidence, "low");
});

test("detectSybilClusters returns empty for unique funding sources", () => {
  const now = Date.now();
  const wallets: WalletInfo[] = [
    { address: "wallet1", fundingSource: "sourceA", fundedAt: now, entryTimestamp: now },
    { address: "wallet2", fundingSource: "sourceB", fundedAt: now, entryTimestamp: now },
  ];
  const clusters = detectSybilClusters(wallets);
  assert.equal(clusters.length, 0);
});

test("detectSybilClusters elevates confidence for synchronized entry", () => {
  const now = Date.now();
  const wallets: WalletInfo[] = [
    { address: "w1", fundingSource: "src", fundedAt: now, entryTimestamp: now + 1000 },
    { address: "w2", fundingSource: "src", fundedAt: now + 10_000, entryTimestamp: now + 2000 },
    { address: "w3", fundingSource: "src", fundedAt: now + 20_000, entryTimestamp: now + 3000 },
  ];
  const clusters = detectSybilClusters(wallets);
  assert.equal(clusters[0].confidence, "high");
});

test("isWalletFlagged returns true for wallet in flagged cluster", () => {
  const now = Date.now();
  const wallets: WalletInfo[] = [
    { address: "w1", fundingSource: "src", fundedAt: now, entryTimestamp: now },
    { address: "w2", fundingSource: "src", fundedAt: now + 1000, entryTimestamp: now },
    { address: "w3", fundingSource: "src", fundedAt: now + 2000, entryTimestamp: now },
  ];
  const clusters = detectSybilClusters(wallets);
  assert.equal(isWalletFlagged("w1", clusters), true);
  assert.equal(isWalletFlagged("unrelated", clusters), false);
});

// ── Phase 3.2: Funded status transitions ────────────────────────────────────

test("elite tier is funded eligible, scout is not", () => {
  assert.equal(challengeTiers.elite.fundedEligible, true);
  assert.equal(challengeTiers.apex.fundedEligible, true);
  assert.equal(challengeTiers.scout.fundedEligible, false);
  assert.equal(challengeTiers.ranger.fundedEligible, false);
  assert.equal(challengeTiers.veteran.fundedEligible, false);
});
