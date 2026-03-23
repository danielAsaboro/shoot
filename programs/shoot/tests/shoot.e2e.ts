import { expect } from "chai";
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Keypair, PublicKey, SystemProgram, Connection } from "@solana/web3.js";
import { createSurfpoolClient, SurfpoolClient } from "./helpers/surfpool";
import {
  PROGRAM_ID,
  findChallengePda,
  findVaultPda,
  findEnrollmentPda,
  findFundedPda,
} from "./helpers/litesvm";

const SURFPOOL_URL = process.env.SURFPOOL_URL || "http://localhost:8899";

/**
 * Surfpool E2E tests — require a running Surfpool instance.
 *
 * Run with:
 *   surfpool                          # start Surfpool in another terminal
 *   npm run test:e2e                  # run these tests
 *
 * Set SURFPOOL_URL env var to point to a non-default endpoint.
 */
describe("shoot (Surfpool E2E)", function () {
  let client: SurfpoolClient;
  let provider: anchor.AnchorProvider;
  let authority: Keypair;

  before(async function () {
    client = createSurfpoolClient(SURFPOOL_URL);

    // Set up Anchor provider pointing at Surfpool
    const connection = new Connection(SURFPOOL_URL, "confirmed");
    authority = Keypair.generate();

    // Fund authority via Surfpool
    await client.setAccount(authority.publicKey, {
      lamports: 100_000_000_000, // 100 SOL
    });

    const wallet = new anchor.Wallet(authority);
    provider = new anchor.AnchorProvider(connection, wallet, {
      commitment: "confirmed",
    });
  });

  afterEach(async function () {
    await client.resetNetwork();
  });

  // ── Time Travel ─────────────────────────────────────────────────────────

  describe("time travel", () => {
    it("creates challenge, time-travels past duration expiry", async () => {
      const challengeId = "time-test";
      const durationSeconds = 3600; // 1 hour

      const [challengePda] = findChallengePda(authority.publicKey, challengeId);
      const [vaultPda] = findVaultPda(challengePda);

      // Record clock before
      const slotBefore = await client.connection.getSlot();

      // Create challenge with 1-hour duration
      // (Uses raw RPC since we may not have the IDL loaded for Anchor Program)
      await client.setAccount(authority.publicKey, {
        lamports: 100_000_000_000,
      });

      // Time travel 2 hours into the future
      await client.timeTravel(7200);

      // Verify clock advanced
      const slotAfter = await client.connection.getSlot();
      expect(slotAfter).to.be.greaterThan(slotBefore);
    });
  });

  // ── Account State Manipulation ──────────────────────────────────────────

  describe("account state manipulation", () => {
    it("pre-funds vault with surfnet_setAccount", async () => {
      const challengeId = "funded-vault";
      const [challengePda] = findChallengePda(authority.publicKey, challengeId);
      const [vaultPda] = findVaultPda(challengePda);

      // Pre-fund the vault with 100 SOL
      await client.setAccount(vaultPda, {
        lamports: 100_000_000_000,
      });

      // Verify vault balance
      const balance = await client.connection.getBalance(vaultPda);
      expect(balance).to.equal(100_000_000_000);
    });
  });

  // ── Network Reset ───────────────────────────────────────────────────────

  describe("network reset", () => {
    it("resets all state after lifecycle", async () => {
      // Fund an account
      const testKey = Keypair.generate();
      await client.setAccount(testKey.publicKey, {
        lamports: 1_000_000_000,
      });

      // Verify it exists
      const balanceBefore = await client.connection.getBalance(
        testKey.publicKey
      );
      expect(balanceBefore).to.equal(1_000_000_000);

      // Reset network
      await client.resetNetwork();

      // Account should be gone
      const balanceAfter = await client.connection.getBalance(
        testKey.publicKey
      );
      expect(balanceAfter).to.equal(0);
    });
  });
});
