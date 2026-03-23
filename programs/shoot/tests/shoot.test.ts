import { expect } from "chai";
import { Keypair, PublicKey } from "@solana/web3.js";
import { LiteSVM } from "litesvm";
import {
  PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createTestSVM,
  findChallengePda,
  findVaultPda,
  findEnrollmentPda,
  findFundedPda,
  buildInitializeChallengeIx,
  buildEnrollIx,
  buildSubmitResultIx,
  buildSettleChallengeIx,
  buildClaimFundedStatusIx,
  fetchChallenge,
  fetchEnrollment,
  fetchFundedTrader,
  sendTx,
  sendTxExpectFail,
  EnrollmentStatus,
  FundedLevel,
  SHOOT_ERRORS,
} from "./helpers/litesvm";

// ── Token Helpers ─────────────────────────────────────────────────────────

const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey(
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
);

function findAta(owner: PublicKey, mint: PublicKey): PublicKey {
  const [ata] = PublicKey.findProgramAddressSync(
    [owner.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
  return ata;
}

/** Create a fake SPL mint in LiteSVM */
function createMint(svm: LiteSVM, mintAuthority: PublicKey): PublicKey {
  const mint = Keypair.generate();
  const data = Buffer.alloc(82);
  data.writeUInt32LE(1, 0); // COption::Some
  mintAuthority.toBuffer().copy(data, 4);
  data.writeBigUInt64LE(BigInt(1_000_000_000_000), 36); // supply
  data.writeUInt8(6, 44); // decimals
  data.writeUInt8(1, 45); // is_initialized
  svm.setAccount(mint.publicKey, {
    data: new Uint8Array(data),
    executable: false,
    lamports: BigInt(1_000_000_000),
    owner: TOKEN_PROGRAM_ID,
    rentEpoch: BigInt(0),
  });
  return mint.publicKey;
}

/** Create a raw SPL token account at the ATA address */
function createTokenAccount(
  svm: LiteSVM,
  owner: PublicKey,
  mint: PublicKey,
  amount: bigint
): PublicKey {
  const ata = findAta(owner, mint);
  const data = Buffer.alloc(165);
  mint.toBuffer().copy(data, 0); // mint (32)
  owner.toBuffer().copy(data, 32); // owner (32)
  data.writeBigUInt64LE(amount, 64); // amount (8)
  data.writeUInt8(1, 108); // state: Initialized
  svm.setAccount(ata, {
    data: new Uint8Array(data),
    executable: false,
    lamports: BigInt(2_039_280),
    owner: TOKEN_PROGRAM_ID,
    rentEpoch: BigInt(0),
  });
  return ata;
}

/** Read the amount from a token account */
function getTokenBalance(svm: LiteSVM, tokenAccount: PublicKey): bigint {
  const acct = svm.getAccount(tokenAccount);
  if (!acct) return BigInt(0);
  const data = Buffer.from(acct.data);
  return data.readBigUInt64LE(64);
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe("shoot (LiteSVM)", () => {
  let svm: LiteSVM;
  let authority: Keypair;
  let resultAuthority: Keypair;
  let trader: Keypair;
  let usdcMint: PublicKey;

  const CHALLENGE_ID = "scout-sprint-0324";
  const AIRDROP_AMOUNT = BigInt(10_000_000_000); // 10 SOL

  let challengePda: PublicKey;
  let vaultPda: PublicKey;
  let enrollmentPda: PublicKey;
  let traderUsdc: PublicKey;

  before(() => {
    svm = createTestSVM();

    authority = Keypair.generate();
    resultAuthority = Keypair.generate();
    trader = Keypair.generate();
    svm.airdrop(authority.publicKey, AIRDROP_AMOUNT);
    svm.airdrop(resultAuthority.publicKey, AIRDROP_AMOUNT);
    svm.airdrop(trader.publicKey, AIRDROP_AMOUNT);

    usdcMint = createMint(svm, authority.publicKey);
    traderUsdc = createTokenAccount(
      svm,
      trader.publicKey,
      usdcMint,
      BigInt(100_000_000) // 100 USDC
    );

    [challengePda] = findChallengePda(authority.publicKey, CHALLENGE_ID);
    [vaultPda] = findVaultPda(challengePda);
    [enrollmentPda] = findEnrollmentPda(challengePda, trader.publicKey);
  });

  // ── Happy Paths ─────────────────────────────────────────────────────────

  describe("initialize_challenge", () => {
    it("creates challenge PDA with all fields set correctly", () => {
      const ix = buildInitializeChallengeIx(
        authority.publicKey,
        resultAuthority.publicKey,
        usdcMint,
        {
          challengeId: CHALLENGE_ID,
          tierName: "Scout",
          entryFeeUsdc: 10_000_000,
          profitTargetBps: 800,
          maxDrawdownBps: 500,
          dailyLossLimitBps: 300,
          durationSeconds: 7 * 24 * 60 * 60,
          minCapitalUsd: 50_000_000,
          participantCap: 128,
        }
      );

      sendTx(svm, ix, [authority]);

      const challenge = fetchChallenge(svm, challengePda);
      expect(challenge.admin.toBase58()).to.equal(
        authority.publicKey.toBase58()
      );
      expect(challenge.challengeId).to.equal(CHALLENGE_ID);
      expect(challenge.tierName).to.equal("Scout");
      expect(challenge.entryFeeUsdc).to.equal(BigInt(10_000_000));
      expect(challenge.profitTargetBps).to.equal(800);
      expect(challenge.maxDrawdownBps).to.equal(500);
      expect(challenge.dailyLossLimitBps).to.equal(300);
      expect(challenge.durationSeconds).to.equal(BigInt(7 * 24 * 60 * 60));
      expect(challenge.minCapitalUsd).to.equal(BigInt(50_000_000));
      expect(challenge.participantCap).to.equal(128);
      expect(challenge.enrolledCount).to.equal(0);
      expect(challenge.status).to.equal(0); // Active
      expect(challenge.vault.toBase58()).to.equal(vaultPda.toBase58());
      expect(challenge.usdcMint.toBase58()).to.equal(usdcMint.toBase58());
    });
  });

  describe("enroll", () => {
    it("enrolls trader with USDC entry fee transfer", () => {
      const traderBefore = getTokenBalance(svm, traderUsdc);
      const vaultBefore = getTokenBalance(svm, vaultPda);

      const ix = buildEnrollIx(
        trader.publicKey,
        challengePda,
        traderUsdc,
        vaultPda,
        BigInt(500_000_000) // 500 USD starting equity
      );
      sendTx(svm, ix, [trader]);

      const enrollment = fetchEnrollment(svm, enrollmentPda);
      expect(enrollment.trader.toBase58()).to.equal(
        trader.publicKey.toBase58()
      );
      expect(enrollment.challenge.toBase58()).to.equal(
        challengePda.toBase58()
      );
      expect(enrollment.startingEquityUsd).to.equal(BigInt(500_000_000));
      expect(enrollment.settled).to.be.false;
      expect(enrollment.status).to.equal(EnrollmentStatus.Active);

      // enrolled count incremented
      const challenge = fetchChallenge(svm, challengePda);
      expect(challenge.enrolledCount).to.equal(1);

      // vault received USDC entry fee
      const traderAfter = getTokenBalance(svm, traderUsdc);
      const vaultAfter = getTokenBalance(svm, vaultPda);
      expect(traderBefore - traderAfter).to.equal(BigInt(10_000_000));
      expect(vaultAfter - vaultBefore).to.equal(BigInt(10_000_000));
    });
  });

  describe("submit_result + settle_challenge", () => {
    it("submits result then settles with payout", () => {
      // Submit result (trader passed)
      const submitIx = buildSubmitResultIx(
        resultAuthority.publicKey,
        challengePda,
        enrollmentPda,
        EnrollmentStatus.Passed,
        1500, // +15% PnL
        300 // 3% max drawdown
      );
      sendTx(svm, submitIx, [resultAuthority]);

      let enrollment = fetchEnrollment(svm, enrollmentPda);
      expect(enrollment.status).to.equal(EnrollmentStatus.Passed);
      expect(enrollment.finalPnlBps).to.equal(1500);
      expect(enrollment.finalDrawdownBps).to.equal(300);

      // Fund vault for payout (set balance directly)
      const vaultAcct = svm.getAccount(vaultPda)!;
      const vaultData = Buffer.from(vaultAcct.data);
      vaultData.writeBigUInt64LE(BigInt(50_000_000), 64);
      svm.setAccount(vaultPda, {
        data: new Uint8Array(vaultData),
        executable: vaultAcct.executable,
        lamports: vaultAcct.lamports,
        owner: vaultAcct.owner,
        rentEpoch: vaultAcct.rentEpoch,
      });

      // Settle with payout
      const settleIx = buildSettleChallengeIx(
        resultAuthority.publicKey,
        challengePda,
        trader.publicKey,
        traderUsdc,
        vaultPda,
        BigInt(20_000_000) // 20 USDC
      );
      sendTx(svm, settleIx, [resultAuthority]);

      enrollment = fetchEnrollment(svm, enrollmentPda);
      expect(enrollment.settled).to.be.true;
      expect(enrollment.payoutUsdc).to.equal(BigInt(20_000_000));
    });

    it("submits result as failed (separate challenge)", () => {
      const failId = "fail-test-001";
      const failTrader = Keypair.generate();
      svm.airdrop(failTrader.publicKey, AIRDROP_AMOUNT);

      const [failChallenge] = findChallengePda(authority.publicKey, failId);
      const [failVault] = findVaultPda(failChallenge);

      // Create challenge
      sendTx(
        svm,
        buildInitializeChallengeIx(
          authority.publicKey,
          resultAuthority.publicKey,
          usdcMint,
          {
            challengeId: failId,
            tierName: "Test",
            entryFeeUsdc: 1_000,
            profitTargetBps: 500,
            maxDrawdownBps: 500,
            dailyLossLimitBps: 300,
            durationSeconds: 3600,
            minCapitalUsd: 10_000_000,
            participantCap: 10,
          }
        ),
        [authority]
      );

      // Create token account + enroll
      const failTraderUsdc = createTokenAccount(
        svm,
        failTrader.publicKey,
        usdcMint,
        BigInt(100_000_000)
      );

      sendTx(
        svm,
        buildEnrollIx(
          failTrader.publicKey,
          failChallenge,
          failTraderUsdc,
          failVault,
          BigInt(100_000_000)
        ),
        [failTrader]
      );

      // Submit result as fail
      const [failEnrollment] = findEnrollmentPda(
        failChallenge,
        failTrader.publicKey
      );
      sendTx(
        svm,
        buildSubmitResultIx(
          resultAuthority.publicKey,
          failChallenge,
          failEnrollment,
          EnrollmentStatus.FailedDrawdown,
          -500,
          800
        ),
        [resultAuthority]
      );

      const enrollment = fetchEnrollment(svm, failEnrollment);
      expect(enrollment.status).to.equal(EnrollmentStatus.FailedDrawdown);
      expect(enrollment.finalPnlBps).to.equal(-500);
      expect(enrollment.finalDrawdownBps).to.equal(800);
    });
  });

  describe("claim_funded_status", () => {
    it("creates FundedTrader PDA after settled enrollment", () => {
      // The main challenge trader was already submitted+settled above
      const ix = buildClaimFundedStatusIx(
        trader.publicKey,
        resultAuthority.publicKey,
        challengePda,
        enrollmentPda,
        FundedLevel.Watchlist,
        150
      );
      sendTx(svm, ix, [trader, resultAuthority]);

      const [fundedPda] = findFundedPda(trader.publicKey);
      const funded = fetchFundedTrader(svm, fundedPda);
      expect(funded.trader.toBase58()).to.equal(trader.publicKey.toBase58());
      expect(funded.level).to.equal(FundedLevel.Watchlist);
      expect(funded.revenueShareBps).to.equal(150);
    });
  });

  // ── Error Cases ─────────────────────────────────────────────────────────

  describe("error cases", () => {
    it("rejects double submit (AlreadySettled)", () => {
      // Try to submit result again on already-settled enrollment
      const ix = buildSubmitResultIx(
        resultAuthority.publicKey,
        challengePda,
        enrollmentPda,
        EnrollmentStatus.FailedDrawdown,
        -500,
        800
      );

      const err = sendTxExpectFail(svm, ix, [resultAuthority]);
      expect(err.customErrorCode).to.equal(SHOOT_ERRORS.AlreadySettled);
      expect(err.logs.some((l) => l.includes("AlreadySettled"))).to.be.true;
    });

    it("rejects enrollment when challenge is full (ChallengeFull)", () => {
      const tinyId = "tiny-cap-test";

      sendTx(
        svm,
        buildInitializeChallengeIx(
          authority.publicKey,
          resultAuthority.publicKey,
          usdcMint,
          {
            challengeId: tinyId,
            tierName: "Test",
            entryFeeUsdc: 1_000,
            profitTargetBps: 500,
            maxDrawdownBps: 500,
            dailyLossLimitBps: 300,
            durationSeconds: 3600,
            minCapitalUsd: 10_000_000,
            participantCap: 1,
          }
        ),
        [authority]
      );

      const [tinyChallenge] = findChallengePda(authority.publicKey, tinyId);
      const [tinyVault] = findVaultPda(tinyChallenge);

      // First enrollment succeeds
      const t1 = Keypair.generate();
      svm.airdrop(t1.publicKey, AIRDROP_AMOUNT);
      const t1Usdc = createTokenAccount(
        svm,
        t1.publicKey,
        usdcMint,
        BigInt(100_000_000)
      );
      sendTx(
        svm,
        buildEnrollIx(t1.publicKey, tinyChallenge, t1Usdc, tinyVault, BigInt(100_000_000)),
        [t1]
      );

      // Second enrollment should fail
      const t2 = Keypair.generate();
      svm.airdrop(t2.publicKey, AIRDROP_AMOUNT);
      const t2Usdc = createTokenAccount(
        svm,
        t2.publicKey,
        usdcMint,
        BigInt(100_000_000)
      );

      const err = sendTxExpectFail(
        svm,
        buildEnrollIx(t2.publicKey, tinyChallenge, t2Usdc, tinyVault, BigInt(100_000_000)),
        [t2]
      );
      expect(err.customErrorCode).to.equal(SHOOT_ERRORS.ChallengeFull);
      expect(err.logs.some((l) => l.includes("ChallengeFull"))).to.be.true;
    });

    it("rejects submit by non-authority (Unauthorized)", () => {
      const unauthId = "unauth-test";
      sendTx(
        svm,
        buildInitializeChallengeIx(
          authority.publicKey,
          resultAuthority.publicKey,
          usdcMint,
          {
            challengeId: unauthId,
            tierName: "Test",
            entryFeeUsdc: 1_000,
            profitTargetBps: 500,
            maxDrawdownBps: 500,
            dailyLossLimitBps: 300,
            durationSeconds: 3600,
            minCapitalUsd: 10_000_000,
            participantCap: 10,
          }
        ),
        [authority]
      );

      const [unauthChallenge] = findChallengePda(
        authority.publicKey,
        unauthId
      );
      const [unauthVault] = findVaultPda(unauthChallenge);
      const unauthTrader = Keypair.generate();
      svm.airdrop(unauthTrader.publicKey, AIRDROP_AMOUNT);
      const unauthUsdc = createTokenAccount(
        svm,
        unauthTrader.publicKey,
        usdcMint,
        BigInt(100_000_000)
      );

      sendTx(
        svm,
        buildEnrollIx(
          unauthTrader.publicKey,
          unauthChallenge,
          unauthUsdc,
          unauthVault,
          BigInt(100_000_000)
        ),
        [unauthTrader]
      );

      // Try to submit result with a random signer (not the result_authority)
      const imposter = Keypair.generate();
      svm.airdrop(imposter.publicKey, AIRDROP_AMOUNT);

      const [unauthEnrollment] = findEnrollmentPda(
        unauthChallenge,
        unauthTrader.publicKey
      );

      const ix = buildSubmitResultIx(
        imposter.publicKey,
        unauthChallenge,
        unauthEnrollment,
        EnrollmentStatus.Passed,
        100,
        50
      );

      const err = sendTxExpectFail(svm, ix, [imposter]);
      expect(err.customErrorCode).to.equal(SHOOT_ERRORS.Unauthorized);
      expect(err.logs.some((l) => l.includes("Unauthorized"))).to.be.true;
    });

    it("rejects enroll in non-Active state (ChallengeNotOpen)", () => {
      const stateId = "state-test";
      sendTx(
        svm,
        buildInitializeChallengeIx(
          authority.publicKey,
          resultAuthority.publicKey,
          usdcMint,
          {
            challengeId: stateId,
            tierName: "Test",
            entryFeeUsdc: 1_000,
            profitTargetBps: 500,
            maxDrawdownBps: 500,
            dailyLossLimitBps: 300,
            durationSeconds: 3600,
            minCapitalUsd: 10_000_000,
            participantCap: 10,
          }
        ),
        [authority]
      );

      const [stateChallenge] = findChallengePda(authority.publicKey, stateId);
      const [stateVault] = findVaultPda(stateChallenge);

      // Fetch raw account and flip status byte to Settling (1)
      const acct = svm.getAccount(stateChallenge)!;
      const data = Buffer.from(acct.data);

      // Calculate offset of status field:
      // 8 (disc) + 32 (admin) + 32 (result_authority)
      // + (4+len) challenge_id + (4+len) tier_name
      // + 8 (entry_fee) + 2 (profit) + 2 (drawdown) + 2 (daily_loss)
      // + 8 (duration) + 8 (min_capital) + 2 (participant_cap) + 2 (enrolled_count)
      // = status byte
      const cidLen = stateId.length;
      const tnLen = 4; // "Test"
      const statusOffset =
        8 +
        32 +
        32 +
        (4 + cidLen) +
        (4 + tnLen) +
        8 +
        2 +
        2 +
        2 +
        8 +
        8 +
        2 +
        2;

      // Verify current status is Active (0)
      expect(data.readUInt8(statusOffset)).to.equal(0);

      // Set to Settling (1)
      data.writeUInt8(1, statusOffset);
      svm.setAccount(stateChallenge, {
        data: new Uint8Array(data),
        executable: acct.executable,
        lamports: acct.lamports,
        owner: acct.owner,
        rentEpoch: acct.rentEpoch,
      });

      // Try to enroll — should fail
      const stateTrader = Keypair.generate();
      svm.airdrop(stateTrader.publicKey, AIRDROP_AMOUNT);
      const stateUsdc = createTokenAccount(
        svm,
        stateTrader.publicKey,
        usdcMint,
        BigInt(100_000_000)
      );

      const err = sendTxExpectFail(
        svm,
        buildEnrollIx(
          stateTrader.publicKey,
          stateChallenge,
          stateUsdc,
          stateVault,
          BigInt(100_000_000)
        ),
        [stateTrader]
      );
      expect(err.customErrorCode).to.equal(SHOOT_ERRORS.ChallengeNotOpen);
      expect(err.logs.some((l) => l.includes("not accepting"))).to.be.true;
    });
  });

  // ── PDA Derivation ──────────────────────────────────────────────────────

  describe("PDA derivation", () => {
    it("challenge PDA is deterministic", () => {
      const [pda1] = findChallengePda(authority.publicKey, "test-123");
      const [pda2] = findChallengePda(authority.publicKey, "test-123");
      expect(pda1.toBase58()).to.equal(pda2.toBase58());
    });

    it("different challenge IDs produce different PDAs", () => {
      const [pda1] = findChallengePda(authority.publicKey, "challenge-a");
      const [pda2] = findChallengePda(authority.publicKey, "challenge-b");
      expect(pda1.toBase58()).to.not.equal(pda2.toBase58());
    });

    it("same trader + different challenges produce different enrollment PDAs", () => {
      const traderKey = Keypair.generate().publicKey;
      const [challengeA] = findChallengePda(authority.publicKey, "challenge-a");
      const [challengeB] = findChallengePda(authority.publicKey, "challenge-b");

      const [enrollA] = findEnrollmentPda(challengeA, traderKey);
      const [enrollB] = findEnrollmentPda(challengeB, traderKey);
      expect(enrollA.toBase58()).to.not.equal(enrollB.toBase58());
    });
  });
});
