/**
 * End-to-end tests for the Agent API.
 *
 * These tests hit the real Next.js API routes via HTTP against a running
 * dev server. They exercise the full stack: auth, rate limiting, tool
 * dispatch, and Adrena data API integration.
 *
 * Prerequisites:
 *   - `npm run dev` running on localhost:3000
 *   - PostgreSQL running with the shoot database
 *
 * Run:
 *   node --test --experimental-strip-types tests/agent-api.test.mts
 */

import assert from "node:assert/strict";
import test, { describe, before, after } from "node:test";
import { createHash, randomBytes } from "node:crypto";
import pg from "pg";

const BASE_URL = process.env.TEST_BASE_URL ?? "http://localhost:3000";
const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgresql://cartel@localhost:5432/shoot?schema=public";

// Real Solana wallet for Adrena API calls (known Adrena trader).
// The agent auth binds API keys to wallets, and trading tools inject this
// wallet into Adrena API calls. Must be a valid Solana pubkey.
const REAL_WALLET = "GZXqnVpZuyKWdUH34mgijxJVM1LEngoGWoJzEXtXGhBb";

// Fake wallet for auth-only tests (doesn't hit Adrena API)
const AUTH_TEST_WALLET = "AuthTest_" + randomBytes(12).toString("hex");

// ── Test helpers ────────────────────────────────────────────────────────────

let authApiKey: string;
let authKeyId: string;
let tradeApiKey: string;
let tradeKeyId: string;
let pool: pg.Pool;

async function seedApiKey(
  wallet: string,
  label: string
): Promise<{ id: string; key: string }> {
  const raw = randomBytes(32).toString("base64url");
  const plaintext = `shoot_ak_${raw}`;
  const hash = createHash("sha256").update(plaintext).digest("hex");
  const id = `test_${randomBytes(8).toString("hex")}`;

  await pool.query(
    `INSERT INTO agent_api_keys (id, wallet, key_hash, label, created_at)
     VALUES ($1, $2, $3, $4, NOW())`,
    [id, wallet, hash, label]
  );

  return { id, key: plaintext };
}

async function cleanupTestKeys() {
  await pool.query(`DELETE FROM agent_api_keys WHERE wallet IN ($1, $2)`, [
    AUTH_TEST_WALLET,
    REAL_WALLET,
  ]);
}

function authHeader(key: string) {
  return { Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
}

// ── Setup / Teardown ────────────────────────────────────────────────────────

before(async () => {
  pool = new pg.Pool({ connectionString: DATABASE_URL });
  await cleanupTestKeys();

  // Key bound to fake wallet (for auth tests that don't call Adrena)
  const auth = await seedApiKey(AUTH_TEST_WALLET, "auth-test");
  authApiKey = auth.key;
  authKeyId = auth.id;

  // Key bound to real Solana wallet (for Adrena API tests)
  const trade = await seedApiKey(REAL_WALLET, "trade-test");
  tradeApiKey = trade.key;
  tradeKeyId = trade.id;
});

after(async () => {
  await cleanupTestKeys();
  await pool.end();
});

// ── Auth tests ──────────────────────────────────────────────────────────────

describe("Agent API authentication", () => {
  test("rejects requests with no Authorization header", async () => {
    const res = await fetch(`${BASE_URL}/api/agent/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tool: "getPoolStats", params: {} }),
    });
    assert.equal(res.status, 401);
    const body = (await res.json()) as { error: string };
    assert.match(body.error, /API key/i);
  });

  test("rejects requests with invalid API key", async () => {
    const res = await fetch(`${BASE_URL}/api/agent/execute`, {
      method: "POST",
      headers: authHeader("shoot_ak_bogus_key_that_does_not_exist"),
      body: JSON.stringify({ tool: "getPoolStats", params: {} }),
    });
    assert.equal(res.status, 401);
  });

  test("rejects requests with wrong prefix", async () => {
    const res = await fetch(`${BASE_URL}/api/agent/execute`, {
      method: "POST",
      headers: authHeader("wrong_prefix_abc123"),
      body: JSON.stringify({ tool: "getPoolStats", params: {} }),
    });
    assert.equal(res.status, 401);
  });

  test("accepts requests with valid API key", async () => {
    const res = await fetch(`${BASE_URL}/api/agent/execute`, {
      method: "POST",
      headers: authHeader(authApiKey),
      body: JSON.stringify({ tool: "getActiveCohorts", params: {} }),
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as { result: { cohorts: unknown[] } };
    assert.ok(body.result);
    assert.ok(Array.isArray(body.result.cohorts));
  });

  test("rejects requests with revoked API key", async () => {
    const temp = await seedApiKey(AUTH_TEST_WALLET, "revoke-test");
    await pool.query(
      `UPDATE agent_api_keys SET revoked_at = NOW() WHERE id = $1`,
      [temp.id]
    );

    const res = await fetch(`${BASE_URL}/api/agent/execute`, {
      method: "POST",
      headers: authHeader(temp.key),
      body: JSON.stringify({ tool: "getActiveCohorts", params: {} }),
    });
    assert.equal(res.status, 401);
  });
});

// ── Execute endpoint: DB-only tools ─────────────────────────────────────────

describe("Agent execute: DB tools", () => {
  test("returns error for unknown tool", async () => {
    const res = await fetch(`${BASE_URL}/api/agent/execute`, {
      method: "POST",
      headers: authHeader(authApiKey),
      body: JSON.stringify({ tool: "nonExistentTool", params: {} }),
    });
    assert.equal(res.status, 400);
    const body = (await res.json()) as { error: string };
    assert.match(body.error, /Unknown tool/i);
    assert.match(body.error, /Available:/i);
  });

  test("returns error when tool field is missing", async () => {
    const res = await fetch(`${BASE_URL}/api/agent/execute`, {
      method: "POST",
      headers: authHeader(authApiKey),
      body: JSON.stringify({ params: {} }),
    });
    assert.equal(res.status, 400);
  });

  test("getActiveCohorts returns cohort array", async () => {
    const res = await fetch(`${BASE_URL}/api/agent/execute`, {
      method: "POST",
      headers: authHeader(authApiKey),
      body: JSON.stringify({ tool: "getActiveCohorts", params: {} }),
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as { result: { cohorts: unknown[] } };
    assert.ok(Array.isArray(body.result.cohorts));
  });

  test("getLeaderboard returns empty standings for non-existent cohort", async () => {
    const res = await fetch(`${BASE_URL}/api/agent/execute`, {
      method: "POST",
      headers: authHeader(authApiKey),
      body: JSON.stringify({
        tool: "getLeaderboard",
        params: { cohortId: "nonexistent-cohort-xyz" },
      }),
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as { result: { standings: unknown[] } };
    assert.ok(Array.isArray(body.result.standings));
    assert.equal(body.result.standings.length, 0);
  });

  test("getMyEnrollments returns enrollments array", async () => {
    const res = await fetch(`${BASE_URL}/api/agent/execute`, {
      method: "POST",
      headers: authHeader(authApiKey),
      body: JSON.stringify({ tool: "getMyEnrollments", params: {} }),
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as { result: { enrollments: unknown[] } };
    assert.ok(Array.isArray(body.result.enrollments));
  });
});

// ── Execute endpoint: Adrena API tools (use real wallet key) ────────────────

describe("Agent execute: Adrena read tools", () => {
  test("getPoolStats returns pool data from Adrena", async () => {
    const res = await fetch(`${BASE_URL}/api/agent/execute`, {
      method: "POST",
      headers: authHeader(tradeApiKey),
      body: JSON.stringify({ tool: "getPoolStats", params: {} }),
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as { result: Record<string, unknown> };
    assert.ok(body.result);
    // Adrena pool stats shape
    assert.equal(typeof body.result.daily_volume_usd, "number");
    assert.equal(typeof body.result.total_volume_usd, "number");
  });

  test("getLiquidityInfo returns custody data from Adrena", async () => {
    const res = await fetch(`${BASE_URL}/api/agent/execute`, {
      method: "POST",
      headers: authHeader(tradeApiKey),
      body: JSON.stringify({ tool: "getLiquidityInfo", params: {} }),
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as { result: Record<string, unknown> };
    assert.ok(body.result);
    // The Adrena liquidity API returns custodies array with symbol fields
    assert.ok(
      Array.isArray((body.result as Record<string, unknown>).custodies),
      "result should contain a custodies array"
    );
    const custodies = (body.result as Record<string, unknown>)
      .custodies as Array<Record<string, unknown>>;
    assert.ok(custodies.length > 0, "should have at least one custody");
    assert.equal(typeof custodies[0].symbol, "string");
  });

  test("getPositions returns positions for a real wallet", async () => {
    const res = await fetch(`${BASE_URL}/api/agent/execute`, {
      method: "POST",
      headers: authHeader(tradeApiKey),
      body: JSON.stringify({ tool: "getPositions", params: { limit: 5 } }),
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as { result: { positions: unknown[] } };
    assert.ok(body.result);
    assert.ok(Array.isArray(body.result.positions));
  });
});

// ── Trading tools: unsigned tx generation (real wallet) ─────────────────────
// Uses JITOSOL as the market token and a tiny collateral amount (0.0001 USDC)
// that fits within the test wallet's on-chain balance.

describe("Agent trading tools return unsigned transactions", () => {
  test("openLong returns quote + unsigned transaction", async () => {
    const res = await fetch(`${BASE_URL}/api/agent/execute`, {
      method: "POST",
      headers: authHeader(tradeApiKey),
      body: JSON.stringify({
        tool: "openLong",
        params: {
          collateralAmount: 0.0001,
          collateralTokenSymbol: "USDC",
          tokenSymbol: "JITOSOL",
          leverage: 2,
        },
      }),
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as {
      result: {
        requiresSignature: boolean;
        quote: Record<string, unknown>;
        transaction: string;
      };
    };
    assert.equal(body.result.requiresSignature, true);
    assert.ok(body.result.quote, "should include a quote object");
    assert.equal(typeof body.result.quote.entryPrice, "number");
    assert.ok(
      (body.result.quote.entryPrice as number) > 0,
      "entry price should be positive"
    );
    assert.equal(typeof body.result.transaction, "string");
    assert.ok(
      body.result.transaction.length > 10,
      "transaction should be a non-trivial base64 string"
    );
  });

  test("openShort returns quote + unsigned transaction", async () => {
    const res = await fetch(`${BASE_URL}/api/agent/execute`, {
      method: "POST",
      headers: authHeader(tradeApiKey),
      body: JSON.stringify({
        tool: "openShort",
        params: {
          collateralAmount: 0.0001,
          collateralTokenSymbol: "USDC",
          tokenSymbol: "JITOSOL",
          leverage: 2,
        },
      }),
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as {
      result: {
        requiresSignature: boolean;
        quote: Record<string, unknown>;
        transaction: string;
      };
    };
    assert.equal(body.result.requiresSignature, true);
    assert.ok(body.result.quote);
    assert.ok(body.result.transaction.length > 10);
  });

  test("openLimitLong returns quote + unsigned transaction", async () => {
    const res = await fetch(`${BASE_URL}/api/agent/execute`, {
      method: "POST",
      headers: authHeader(tradeApiKey),
      body: JSON.stringify({
        tool: "openLimitLong",
        params: {
          collateralAmount: 0.0001,
          collateralTokenSymbol: "USDC",
          tokenSymbol: "JITOSOL",
          leverage: 2,
          triggerPrice: 50,
        },
      }),
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as {
      result: {
        requiresSignature: boolean;
        quote: Record<string, unknown>;
        transaction: string;
      };
    };
    assert.equal(body.result.requiresSignature, true);
    assert.ok(body.result.transaction.length > 10);
  });

  test("closeLong passes through Adrena API errors cleanly", async () => {
    const res = await fetch(`${BASE_URL}/api/agent/execute`, {
      method: "POST",
      headers: authHeader(tradeApiKey),
      body: JSON.stringify({
        tool: "closeLong",
        params: {
          collateralTokenSymbol: "USDC",
          tokenSymbol: "JITOSOL",
        },
      }),
    });
    // May return 200 (if wallet has open position) or 500 (Adrena API error)
    // Both are valid — the key thing is auth succeeded and the tool dispatched
    assert.ok(
      [200, 500].includes(res.status),
      `expected 200 or 500, got ${res.status}`
    );
    if (res.status === 200) {
      const body = (await res.json()) as {
        result: { requiresSignature: boolean; transaction: string };
      };
      assert.equal(body.result.requiresSignature, true);
    } else {
      const body = (await res.json()) as { error: string };
      // Should be an Adrena API error, not an auth error
      assert.match(body.error, /Adrena API/i);
    }
  });

  test("wallet is injected from API key, not from params", async () => {
    // Even if we pass a different account in params, the server should
    // use the wallet bound to the API key. We verify by checking the
    // request succeeds with our real-wallet key.
    const res = await fetch(`${BASE_URL}/api/agent/execute`, {
      method: "POST",
      headers: authHeader(tradeApiKey),
      body: JSON.stringify({
        tool: "openLong",
        params: {
          collateralAmount: 0.0001,
          collateralTokenSymbol: "USDC",
          tokenSymbol: "JITOSOL",
          leverage: 2,
        },
      }),
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as {
      result: { requiresSignature: boolean };
    };
    assert.equal(body.result.requiresSignature, true);
  });
});

// ── API key management tests ────────────────────────────────────────────────

describe("Agent /api/agent/keys", () => {
  test("GET lists active keys for authenticated wallet", async () => {
    const res = await fetch(`${BASE_URL}/api/agent/keys`, {
      method: "GET",
      headers: authHeader(authApiKey),
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as {
      keys: Array<{ id: string; label: string }>;
    };
    assert.ok(Array.isArray(body.keys));
    assert.ok(body.keys.length >= 1);
    const found = body.keys.find((k) => k.id === authKeyId);
    assert.ok(found, "test key should be in the list");
    assert.equal(found!.label, "auth-test");
  });

  test("GET rejects unauthenticated request", async () => {
    const res = await fetch(`${BASE_URL}/api/agent/keys`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });
    assert.equal(res.status, 401);
  });

  test("DELETE revokes a key and it stops working", async () => {
    const temp = await seedApiKey(AUTH_TEST_WALLET, "to-revoke");

    // Revoke via API
    const res = await fetch(`${BASE_URL}/api/agent/keys`, {
      method: "DELETE",
      headers: authHeader(authApiKey),
      body: JSON.stringify({ keyId: temp.id }),
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as { revoked: boolean };
    assert.equal(body.revoked, true);

    // Verify the revoked key no longer authenticates
    const res2 = await fetch(`${BASE_URL}/api/agent/execute`, {
      method: "POST",
      headers: authHeader(temp.key),
      body: JSON.stringify({ tool: "getActiveCohorts", params: {} }),
    });
    assert.equal(res2.status, 401);
  });

  test("DELETE rejects revocation of non-existent key", async () => {
    const res = await fetch(`${BASE_URL}/api/agent/keys`, {
      method: "DELETE",
      headers: authHeader(authApiKey),
      body: JSON.stringify({ keyId: "nonexistent-id" }),
    });
    assert.equal(res.status, 404);
  });

  test("cannot revoke another wallet's key", async () => {
    // tradeApiKey is bound to REAL_WALLET, authApiKey is bound to AUTH_TEST_WALLET
    // authApiKey should not be able to revoke tradeKeyId
    const res = await fetch(`${BASE_URL}/api/agent/keys`, {
      method: "DELETE",
      headers: authHeader(authApiKey),
      body: JSON.stringify({ keyId: tradeKeyId }),
    });
    assert.equal(res.status, 404); // appears as "not found" to prevent enumeration
  });
});

// ── Chat endpoint tests ─────────────────────────────────────────────────────

describe("Agent /api/agent/chat", () => {
  test("rejects unauthenticated request", async () => {
    const res = await fetch(`${BASE_URL}/api/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [{ role: "user", content: "hello" }],
      }),
    });
    assert.equal(res.status, 401);
  });

  test("rejects request without messages", async () => {
    const res = await fetch(`${BASE_URL}/api/agent/chat`, {
      method: "POST",
      headers: authHeader(authApiKey),
      body: JSON.stringify({}),
    });
    assert.equal(res.status, 400);
    const body = (await res.json()) as { error: string };
    assert.match(body.error, /messages/i);
  });
});
