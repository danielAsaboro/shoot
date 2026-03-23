import { expect } from "chai";
import * as anchor from "@coral-xyz/anchor";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  Connection,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
  SYSVAR_RENT_PUBKEY,
} from "@solana/web3.js";
import { createSurfpoolClient, SurfpoolClient } from "./helpers/surfpool";
import {
  PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  findChallengePda,
  findVaultPda,
  findEnrollmentPda,
  findFundedPda,
  buildInitializeChallengeIx,
  buildEnrollIx,
  buildSubmitResultIx,
  buildSettleChallengeIx,
  buildClaimFundedStatusIx,
  decodeChallenge,
  decodeEnrollment,
  decodeFundedTrader,
  EnrollmentStatus,
  FundedLevel,
} from "./helpers/litesvm";

const SURFPOOL_URL = process.env.SURFPOOL_URL || "http://localhost:8899";

// Fake USDC mint for local testing (we create it via surfnet_setAccount)
const USDC_MINT = new Keypair().publicKey;

// Associated Token Program ID
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey(
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
);

/** Derive the Associated Token Address for a given owner + mint */
function findAta(owner: PublicKey, mint: PublicKey): PublicKey {
  const [ata] = PublicKey.findProgramAddressSync(
    [owner.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
  return ata;
}

/**
 * Surfpool E2E tests — require a running Surfpool instance.
 *
 * Run with:
 *   cd programs/shoot
 *   surfpool                          # start Surfpool in another terminal
 *   npm run test:e2e                  # run these tests
 *
 * Set SURFPOOL_URL env var to point to a non-default endpoint.
 */
describe("shoot (Surfpool E2E)", function () {
  this.timeout(60_000);

  let client: SurfpoolClient;
  let connection: Connection;
  let authority: Keypair;
  let resultAuthority: Keypair;

  before(async function () {
    this.timeout(30_000);
    client = createSurfpoolClient(SURFPOOL_URL);
    connection = client.connection;

    // Verify the program is deployed (via Surfpool runbook with instant_surfnet_deployment)
    const progInfo = await connection.getAccountInfo(PROGRAM_ID);
    if (!progInfo || !progInfo.executable) {
      throw new Error(
        "Shoot program not deployed. Start Surfpool with: surfpool start --no-tui --yes --offline"
      );
    }

    authority = Keypair.generate();
    resultAuthority = Keypair.generate();

    // Fund authority and result authority via Surfpool
    await client.setAccount(authority.publicKey, {
      lamports: 100_000_000_000, // 100 SOL
    });
    await client.setAccount(resultAuthority.publicKey, {
      lamports: 100_000_000_000,
    });

    // Create a USDC-like mint account (SPL Token mint structure)
    const mintData = Buffer.alloc(82);
    mintData.writeUInt32LE(1, 0); // COption::Some for mint_authority
    authority.publicKey.toBuffer().copy(mintData, 4);
    mintData.writeBigUInt64LE(BigInt(1_000_000_000_000), 36); // supply
    mintData.writeUInt8(6, 44); // decimals
    mintData.writeUInt8(1, 45); // is_initialized

    await client.setAccount(USDC_MINT, {
      lamports: 1_000_000_000,
      data: mintData,
      owner: TOKEN_PROGRAM_ID,
    });
  });

  // No afterEach reset — resetNetwork wipes the deployed program.
  // Each test uses unique keypairs so state doesn't conflict.

  // ── Helpers ──────────────────────────────────────────────────────────────

  async function sendTx(
    ixs: TransactionInstruction[],
    signers: Keypair[]
  ): Promise<string> {
    const tx = new Transaction();
    tx.add(...ixs);
    const sig = await sendAndConfirmTransaction(connection, tx, signers, {
      commitment: "confirmed",
      skipPreflight: false,
    });
    // Verify the transaction didn't fail silently
    const result = await connection.getTransaction(sig, {
      commitment: "confirmed",
    });
    if (result?.meta?.err) {
      throw new Error(
        `Transaction ${sig} failed on-chain: ${JSON.stringify(result.meta.err)}\nLogs: ${result.meta.logMessages?.join("\n")}`
      );
    }
    return sig;
  }

  async function fetchAccountData(pubkey: PublicKey): Promise<Buffer | null> {
    const info = await connection.getAccountInfo(pubkey, "confirmed");
    return info ? Buffer.from(info.data) : null;
  }

  // ── Time Travel ─────────────────────────────────────────────────────────

  describe("time travel", () => {
    it("advances the network clock via absoluteSlot", async () => {
      const slotBefore = await connection.getSlot();
      // Use absoluteSlot since absoluteTimestamp may not be supported in all modes
      await client.timeTravel(7200);
      const slotAfter = await connection.getSlot();
      expect(slotAfter).to.be.greaterThan(slotBefore);
    });
  });

  // ── Account State Manipulation ──────────────────────────────────────────

  describe("account state manipulation", () => {
    it("pre-funds vault with surfnet_setAccount", async () => {
      const challengeId = "funded-vault";
      const [challengePda] = findChallengePda(authority.publicKey, challengeId);
      const [vaultPda] = findVaultPda(challengePda);

      await client.setAccount(vaultPda, {
        lamports: 100_000_000_000,
      });

      const balance = await connection.getBalance(vaultPda);
      expect(balance).to.equal(100_000_000_000);
    });

    it("creates token accounts via createRawTokenAccount", async () => {
      const trader = Keypair.generate();
      const ata = findAta(trader.publicKey, USDC_MINT);

      await client.createRawTokenAccount(
        ata,
        USDC_MINT,
        trader.publicKey,
        BigInt(500_000_000) // 500 USDC
      );

      // Verify ATA exists
      const info = await connection.getAccountInfo(ata, "confirmed");
      expect(info).to.not.be.null;
      expect(info!.data.length).to.equal(165); // SPL Token account size
    });
  });

  // ── Challenge Lifecycle (Initialize → Enroll → Settle) ─────────────────

  describe("challenge lifecycle", () => {
    let testIndex = 0;
    let challengeId: string;
    let challengePda: PublicKey;
    let vaultPda: PublicKey;
    let trader: Keypair;

    beforeEach(async function () {
      this.timeout(30_000);
      testIndex++;
      challengeId = `e2e-lifecycle-${testIndex}`;

      // Re-fund authorities
      await client.setAccount(authority.publicKey, {
        lamports: 100_000_000_000,
      });
      await client.setAccount(resultAuthority.publicKey, {
        lamports: 100_000_000_000,
      });

      [challengePda] = findChallengePda(authority.publicKey, challengeId);
      [vaultPda] = findVaultPda(challengePda);
      trader = Keypair.generate();

      // Fund trader
      await client.setAccount(trader.publicKey, {
        lamports: 10_000_000_000, // 10 SOL
      });

      // Re-create mint
      const mintData = Buffer.alloc(82);
      mintData.writeUInt32LE(1, 0);
      authority.publicKey.toBuffer().copy(mintData, 4);
      mintData.writeBigUInt64LE(BigInt(1_000_000_000_000), 36);
      mintData.writeUInt8(6, 44);
      mintData.writeUInt8(1, 45);
      await client.setAccount(USDC_MINT, {
        lamports: 1_000_000_000,
        data: mintData,
        owner: TOKEN_PROGRAM_ID,
      });

      // Create trader USDC token account at the ATA address with 100 USDC
      const traderAta = findAta(trader.publicKey, USDC_MINT);
      await client.createRawTokenAccount(
        traderAta,
        USDC_MINT,
        trader.publicKey,
        BigInt(100_000_000) // 100 USDC
      );
    });

    it("initializes a challenge with correct PDA state", async () => {
      const ix = buildInitializeChallengeIx(
        authority.publicKey,
        resultAuthority.publicKey,
        USDC_MINT,
        {
          challengeId,
          tierName: "Scout",
          entryFeeUsdc: 10_000_000, // 10 USDC
          profitTargetBps: 800,
          maxDrawdownBps: 500,
          dailyLossLimitBps: 300,
          durationSeconds: 7 * 24 * 60 * 60, // 1 week
          minCapitalUsd: 50_000_000,
          participantCap: 128,
        }
      );

      await sendTx([ix], [authority]);

      const data = await fetchAccountData(challengePda);
      expect(data).to.not.be.null;
      const challenge = decodeChallenge(data!);
      expect(challenge.challengeId).to.equal(challengeId);
      expect(challenge.tierName).to.equal("Scout");
      expect(challenge.enrolledCount).to.equal(0);
      expect(challenge.resultAuthority.toBase58()).to.equal(
        resultAuthority.publicKey.toBase58()
      );
    });

    it("enrolls a trader and increments enrolled count", async () => {
      // Initialize challenge first
      const initIx = buildInitializeChallengeIx(
        authority.publicKey,
        resultAuthority.publicKey,
        USDC_MINT,
        {
          challengeId,
          tierName: "Scout",
          entryFeeUsdc: 10_000_000,
          profitTargetBps: 800,
          maxDrawdownBps: 500,
          dailyLossLimitBps: 300,
          durationSeconds: 604800,
          minCapitalUsd: 50_000_000,
          participantCap: 128,
        }
      );
      await sendTx([initIx], [authority]);

      // Enroll trader
      const traderAta = findAta(trader.publicKey, USDC_MINT);
      const enrollIx = buildEnrollIx(
        trader.publicKey,
        challengePda,
        traderAta,
        vaultPda,
        BigInt(500_000_000) // 500 USD starting equity
      );
      await sendTx([enrollIx], [trader]);

      // Verify enrollment PDA
      const [enrollmentPda] = findEnrollmentPda(
        challengePda,
        trader.publicKey
      );
      const enrollData = await fetchAccountData(enrollmentPda);
      expect(enrollData).to.not.be.null;
      const enrollment = decodeEnrollment(enrollData!);
      expect(enrollment.trader.toBase58()).to.equal(
        trader.publicKey.toBase58()
      );
      expect(enrollment.settled).to.be.false;
      expect(enrollment.status).to.equal(EnrollmentStatus.Active);

      // Verify enrolled count incremented
      const challengeData = await fetchAccountData(challengePda);
      const challenge = decodeChallenge(challengeData!);
      expect(challenge.enrolledCount).to.equal(1);
    });

    it("submits result and settles payout for passing trader", async () => {
      // Initialize challenge
      const initIx = buildInitializeChallengeIx(
        authority.publicKey,
        resultAuthority.publicKey,
        USDC_MINT,
        {
          challengeId,
          tierName: "Scout",
          entryFeeUsdc: 10_000_000,
          profitTargetBps: 800,
          maxDrawdownBps: 500,
          dailyLossLimitBps: 300,
          durationSeconds: 604800,
          minCapitalUsd: 50_000_000,
          participantCap: 128,
        }
      );
      await sendTx([initIx], [authority]);

      // Enroll trader
      const traderAta = findAta(trader.publicKey, USDC_MINT);
      const enrollIx = buildEnrollIx(
        trader.publicKey,
        challengePda,
        traderAta,
        vaultPda,
        BigInt(500_000_000)
      );
      await sendTx([enrollIx], [trader]);

      // Pre-fund vault with extra USDC for settlement payout
      // The vault is at vaultPda (already a token account from initializeChallenge)
      // We need to increase its balance — use setAccount to update the amount field
      const vaultInfo = await connection.getAccountInfo(vaultPda, "confirmed");
      if (vaultInfo) {
        const vaultData = Buffer.from(vaultInfo.data);
        // Write new amount at offset 64 (after mint + owner)
        vaultData.writeBigUInt64LE(BigInt(50_000_000), 64);
        await client.setAccount(vaultPda, {
          data: vaultData,
          lamports: vaultInfo.lamports,
          owner: TOKEN_PROGRAM_ID,
        });
      }

      // Submit result (trader passed)
      const [enrollmentPda] = findEnrollmentPda(
        challengePda,
        trader.publicKey
      );
      const submitIx = buildSubmitResultIx(
        resultAuthority.publicKey,
        challengePda,
        enrollmentPda,
        EnrollmentStatus.Passed,
        1500, // +15% PnL
        300 // 3% max drawdown
      );
      await sendTx([submitIx], [resultAuthority]);

      // Verify enrollment status updated
      const enrollData = await fetchAccountData(enrollmentPda);
      const enrollment = decodeEnrollment(enrollData!);
      expect(enrollment.status).to.equal(EnrollmentStatus.Passed);
      expect(enrollment.finalPnlBps).to.equal(1500);
      expect(enrollment.finalDrawdownBps).to.equal(300);

      // Settle challenge (USDC transfer from vault to trader)
      const settleIx = buildSettleChallengeIx(
        resultAuthority.publicKey,
        challengePda,
        trader.publicKey,
        traderAta,
        vaultPda,
        BigInt(20_000_000) // 20 USDC payout
      );
      await sendTx([settleIx], [resultAuthority]);

      // Verify enrollment marked settled
      const settledData = await fetchAccountData(enrollmentPda);
      const settledEnrollment = decodeEnrollment(settledData!);
      expect(settledEnrollment.settled).to.be.true;
    });
  });

  // ── Time-Based Scenarios ────────────────────────────────────────────────

  describe("time-based scenarios", () => {
    beforeEach(async function () {
      this.timeout(30_000);
      // Program persists via instant_surfnet_deployment
      await client.setAccount(authority.publicKey, {
        lamports: 100_000_000_000,
      });
      await client.setAccount(resultAuthority.publicKey, {
        lamports: 100_000_000_000,
      });
    });

    it("time-travels past challenge duration for expiry testing", async () => {
      const challengeId = "expiry-test";
      const [challengePda] = findChallengePda(
        authority.publicKey,
        challengeId
      );

      // Re-create mint
      const mintData = Buffer.alloc(82);
      mintData.writeUInt32LE(1, 0);
      authority.publicKey.toBuffer().copy(mintData, 4);
      mintData.writeBigUInt64LE(BigInt(1_000_000_000_000), 36);
      mintData.writeUInt8(6, 44);
      mintData.writeUInt8(1, 45);
      await client.setAccount(USDC_MINT, {
        lamports: 1_000_000_000,
        data: mintData,
        owner: TOKEN_PROGRAM_ID,
      });

      // Create a 1-hour challenge
      const ix = buildInitializeChallengeIx(
        authority.publicKey,
        resultAuthority.publicKey,
        USDC_MINT,
        {
          challengeId,
          tierName: "Sprint",
          entryFeeUsdc: 5_000_000,
          profitTargetBps: 500,
          maxDrawdownBps: 500,
          dailyLossLimitBps: 300,
          durationSeconds: 3600, // 1 hour
          minCapitalUsd: 10_000_000,
          participantCap: 10,
        }
      );
      await sendTx([ix], [authority]);

      // Time travel 2 hours — past the challenge duration
      await client.timeTravel(7200);

      // Challenge PDA should still exist (expiry is checked off-chain)
      const data = await fetchAccountData(challengePda);
      expect(data).to.not.be.null;
      const challenge = decodeChallenge(data!);
      expect(challenge.durationSeconds).to.equal(BigInt(3600));
    });
  });

  // ── Cloned Adrena Accounts ──────────────────────────────────────────────
  // These tests require Surfpool started with --rpc-url https://api.mainnet-beta.solana.com
  // Skip in offline mode.

  describe("cloned adrena accounts", function () {
    const ADRENA_STAKING_ACCOUNT = new PublicKey(
      "5Feq2MKbimA44dqgFHLWr7h77xAqY9cet5zn9eMCj78p"
    );
    const ADRENA_REWARD_TOKEN_ACCOUNT = new PublicKey(
      "A3UJxhPtieUr1mjgJhJaTPqDReDaB2H9q7hzs2icrUeS"
    );
    const MAINNET_USDC_MINT = new PublicKey(
      "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
    );

    let isOnline: boolean;

    before(async function () {
      // Check if mainnet accounts are reachable (i.e., Surfpool has a remote RPC)
      const info = await connection.getAccountInfo(ADRENA_STAKING_ACCOUNT, "confirmed");
      isOnline = info !== null;
      if (!isOnline) console.log("  (skipping — start Surfpool with --rpc-url mainnet for these tests)");
    });

    it("has the Adrena staking account cloned from mainnet", async function () {
      if (!isOnline) this.skip();
      const info = await connection.getAccountInfo(ADRENA_STAKING_ACCOUNT, "confirmed");
      expect(info).to.not.be.null;
      expect(info!.data.length).to.be.greaterThan(0);
    });

    it("has the reward token account cloned from mainnet", async function () {
      if (!isOnline) this.skip();
      const info = await connection.getAccountInfo(ADRENA_REWARD_TOKEN_ACCOUNT, "confirmed");
      expect(info).to.not.be.null;
    });

    it("has mainnet USDC mint cloned", async function () {
      if (!isOnline) this.skip();
      const info = await connection.getAccountInfo(MAINNET_USDC_MINT, "confirmed");
      expect(info).to.not.be.null;
      expect(info!.data.length).to.equal(82);
    });

    it("can read staking account data for reward calculations", async function () {
      if (!isOnline) this.skip();
      const info = await connection.getAccountInfo(ADRENA_STAKING_ACCOUNT, "confirmed");
      expect(info).to.not.be.null;
      const data = Buffer.from(info!.data);
      expect(data.length).to.be.greaterThan(8);
    });
  });

  // ── Funded Trader Status ────────────────────────────────────────────────

  describe("funded trader status", () => {
    it("claims funded status after settled enrollment", async () => {
      const FUNDED_CHALLENGE_ID = "funded-claim-001";
      const trader = Keypair.generate();
      await client.setAccount(trader.publicKey, {
        lamports: 10_000_000_000,
      });
      await client.setAccount(authority.publicKey, {
        lamports: 100_000_000_000,
      });
      await client.setAccount(resultAuthority.publicKey, {
        lamports: 100_000_000_000,
      });

      // Re-create mint
      const mintData = Buffer.alloc(82);
      mintData.writeUInt32LE(1, 0);
      authority.publicKey.toBuffer().copy(mintData, 4);
      mintData.writeBigUInt64LE(BigInt(1_000_000_000_000), 36);
      mintData.writeUInt8(6, 44);
      mintData.writeUInt8(1, 45);
      await client.setAccount(USDC_MINT, {
        lamports: 1_000_000_000,
        data: mintData,
        owner: TOKEN_PROGRAM_ID,
      });

      const [challengePda] = findChallengePda(
        authority.publicKey,
        FUNDED_CHALLENGE_ID
      );
      const [vaultPda] = findVaultPda(challengePda);

      // 1. Initialize challenge
      const initIx = buildInitializeChallengeIx(
        authority.publicKey,
        resultAuthority.publicKey,
        USDC_MINT,
        {
          challengeId: FUNDED_CHALLENGE_ID,
          tierName: "Scout",
          entryFeeUsdc: 10_000_000,
          profitTargetBps: 800,
          maxDrawdownBps: 500,
          dailyLossLimitBps: 300,
          durationSeconds: 604800,
          minCapitalUsd: 50_000_000,
          participantCap: 128,
        }
      );
      await sendTx([initIx], [authority]);

      // 2. Create trader USDC + enroll
      const traderAta = findAta(trader.publicKey, USDC_MINT);
      await client.createRawTokenAccount(
        traderAta,
        USDC_MINT,
        trader.publicKey,
        BigInt(100_000_000)
      );
      const enrollIx = buildEnrollIx(
        trader.publicKey,
        challengePda,
        traderAta,
        vaultPda,
        BigInt(500_000_000)
      );
      await sendTx([enrollIx], [trader]);

      // 3. Submit result (passed)
      const [enrollmentPda] = findEnrollmentPda(
        challengePda,
        trader.publicKey
      );
      const submitIx = buildSubmitResultIx(
        resultAuthority.publicKey,
        challengePda,
        enrollmentPda,
        EnrollmentStatus.Passed,
        1500,
        300
      );
      await sendTx([submitIx], [resultAuthority]);

      // 4. Settle (fund vault + settle)
      const vaultInfo = await connection.getAccountInfo(vaultPda, "confirmed");
      if (vaultInfo) {
        const vaultData = Buffer.from(vaultInfo.data);
        vaultData.writeBigUInt64LE(BigInt(50_000_000), 64);
        await client.setAccount(vaultPda, {
          data: vaultData,
          lamports: vaultInfo.lamports,
          owner: TOKEN_PROGRAM_ID,
        });
      }
      const settleIx = buildSettleChallengeIx(
        resultAuthority.publicKey,
        challengePda,
        trader.publicKey,
        traderAta,
        vaultPda,
        BigInt(20_000_000)
      );
      await sendTx([settleIx], [resultAuthority]);

      // 5. Claim funded status (requires both trader + authority as signers)
      const claimIx = buildClaimFundedStatusIx(
        trader.publicKey,
        resultAuthority.publicKey,
        challengePda,
        enrollmentPda,
        FundedLevel.Funded,
        1000 // 10% revenue share
      );
      await sendTx([claimIx], [trader, resultAuthority]);

      const [fundedPda] = findFundedPda(trader.publicKey);
      const data = await fetchAccountData(fundedPda);
      expect(data).to.not.be.null;
      const funded = decodeFundedTrader(data!);
      expect(funded.trader.toBase58()).to.equal(trader.publicKey.toBase58());
      expect(funded.level).to.equal(FundedLevel.Funded);
      expect(funded.revenueShareBps).to.equal(1000);
    });
  });

  // ── Network Reset (MUST be last — wipes all state including deployed program) ──

  describe("network reset", () => {
    it("resets all state after lifecycle", async () => {
      const testKey = Keypair.generate();
      await client.setAccount(testKey.publicKey, {
        lamports: 1_000_000_000,
      });

      const balanceBefore = await connection.getBalance(testKey.publicKey);
      expect(balanceBefore).to.equal(1_000_000_000);

      await client.resetNetwork();

      const balanceAfter = await connection.getBalance(testKey.publicKey);
      expect(balanceAfter).to.equal(0);
    });
  });
});
