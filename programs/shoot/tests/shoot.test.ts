import { expect } from "chai";
import { Keypair, PublicKey } from "@solana/web3.js";
import { LiteSVM } from "litesvm";
import {
  PROGRAM_ID,
  createTestSVM,
  findChallengePda,
  findVaultPda,
  findEnrollmentPda,
  findFundedPda,
  buildInitializeChallengeIx,
  buildEnrollIx,
  buildSettleChallengeIx,
  buildClaimFundedStatusIx,
  fetchChallenge,
  fetchEnrollment,
  fetchFundedTrader,
  fetchAccount,
  sendTx,
  sendTxExpectFail,
  FundedLevel,
  SHOOT_ERRORS,
} from "./helpers/litesvm";

describe("shoot (LiteSVM)", () => {
  let svm: LiteSVM;
  let authority: Keypair;
  let trader: Keypair;

  const CHALLENGE_ID = "scout-sprint-0324";
  const AIRDROP_AMOUNT = BigInt(10_000_000_000); // 10 SOL

  let challengePda: PublicKey;
  let vaultPda: PublicKey;
  let enrollmentPda: PublicKey;

  before(() => {
    svm = createTestSVM();

    authority = Keypair.generate();
    trader = Keypair.generate();
    svm.airdrop(authority.publicKey, AIRDROP_AMOUNT);
    svm.airdrop(trader.publicKey, AIRDROP_AMOUNT);

    [challengePda] = findChallengePda(authority.publicKey, CHALLENGE_ID);
    [vaultPda] = findVaultPda(challengePda);
    [enrollmentPda] = findEnrollmentPda(challengePda, trader.publicKey);
  });

  // ── Happy Paths ─────────────────────────────────────────────────────────

  describe("initialize_challenge", () => {
    it("creates challenge PDA with all fields set correctly", () => {
      const ix = buildInitializeChallengeIx(authority.publicKey, {
        challengeId: CHALLENGE_ID,
        tierName: "Scout",
        entryFeeLamports: 10_000_000,
        profitTargetBps: 800,
        maxDrawdownBps: 500,
        dailyLossLimitBps: 300,
        durationSeconds: 7 * 24 * 60 * 60,
        minCapitalUsd: 50,
        participantCap: 128,
      });

      sendTx(svm, ix, [authority]);

      const challenge = fetchChallenge(svm, challengePda);
      expect(challenge.authority.toBase58()).to.equal(
        authority.publicKey.toBase58()
      );
      expect(challenge.challengeId).to.equal(CHALLENGE_ID);
      expect(challenge.tierName).to.equal("Scout");
      expect(challenge.entryFeeLamports).to.equal(BigInt(10_000_000));
      expect(challenge.profitTargetBps).to.equal(800);
      expect(challenge.maxDrawdownBps).to.equal(500);
      expect(challenge.dailyLossLimitBps).to.equal(300);
      expect(challenge.durationSeconds).to.equal(BigInt(7 * 24 * 60 * 60));
      expect(challenge.minCapitalUsd).to.equal(BigInt(50));
      expect(challenge.participantCap).to.equal(128);
      expect(challenge.enrolledCount).to.equal(0);
      expect(challenge.state).to.equal(0); // Registration
      expect(challenge.vault.toBase58()).to.equal(vaultPda.toBase58());
    });
  });

  describe("enroll", () => {
    it("enrolls trader with entry fee transfer and enrollment PDA", () => {
      const vaultBefore = svm.getBalance(vaultPda);

      const ix = buildEnrollIx(trader.publicKey, challengePda, 500);
      sendTx(svm, ix, [trader]);

      const enrollment = fetchEnrollment(svm, enrollmentPda);
      expect(enrollment.trader.toBase58()).to.equal(
        trader.publicKey.toBase58()
      );
      expect(enrollment.challenge.toBase58()).to.equal(challengePda.toBase58());
      expect(enrollment.startingEquityUsd).to.equal(BigInt(500));
      expect(enrollment.settled).to.be.false;
      expect(enrollment.passed).to.be.false;

      // enrolled count incremented
      const challenge = fetchChallenge(svm, challengePda);
      expect(challenge.enrolledCount).to.equal(1);

      // vault received entry fee
      const vaultAfter = svm.getBalance(vaultPda)!;
      const vaultBeforeVal = vaultBefore ?? BigInt(0);
      expect(vaultAfter - vaultBeforeVal).to.equal(BigInt(10_000_000));
    });
  });

  describe("settle_challenge", () => {
    it("settles with pass=true", () => {
      const ix = buildSettleChallengeIx(
        authority.publicKey,
        challengePda,
        trader.publicKey,
        {
          passed: true,
          payoutLamports: 5_000_000,
          finalPnlBps: 1500,
          finalDrawdownBps: 300,
        }
      );
      sendTx(svm, ix, [authority]);

      const enrollment = fetchEnrollment(svm, enrollmentPda);
      expect(enrollment.settled).to.be.true;
      expect(enrollment.passed).to.be.true;
      expect(enrollment.finalPnlBps).to.equal(1500);
      expect(enrollment.finalDrawdownBps).to.equal(300);
    });

    it("settles with pass=false (separate challenge)", () => {
      const failId = "fail-test-001";
      const failTrader = Keypair.generate();
      svm.airdrop(failTrader.publicKey, AIRDROP_AMOUNT);

      const [failChallenge] = findChallengePda(authority.publicKey, failId);

      // Create challenge
      sendTx(
        svm,
        buildInitializeChallengeIx(authority.publicKey, {
          challengeId: failId,
          tierName: "Test",
          entryFeeLamports: 1_000,
          profitTargetBps: 500,
          maxDrawdownBps: 500,
          dailyLossLimitBps: 300,
          durationSeconds: 3600,
          minCapitalUsd: 10,
          participantCap: 10,
        }),
        [authority]
      );

      // Enroll
      sendTx(svm, buildEnrollIx(failTrader.publicKey, failChallenge, 100), [
        failTrader,
      ]);

      // Settle as fail
      sendTx(
        svm,
        buildSettleChallengeIx(
          authority.publicKey,
          failChallenge,
          failTrader.publicKey,
          {
            passed: false,
            payoutLamports: 0,
            finalPnlBps: -500,
            finalDrawdownBps: 800,
          }
        ),
        [authority]
      );

      const [failEnrollment] = findEnrollmentPda(
        failChallenge,
        failTrader.publicKey
      );
      const enrollment = fetchEnrollment(svm, failEnrollment);
      expect(enrollment.settled).to.be.true;
      expect(enrollment.passed).to.be.false;
      expect(enrollment.finalPnlBps).to.equal(-500);
      expect(enrollment.finalDrawdownBps).to.equal(800);
    });
  });

  describe("claim_funded_status", () => {
    it("creates FundedTrader PDA", () => {
      const ix = buildClaimFundedStatusIx(
        trader.publicKey,
        FundedLevel.Watchlist,
        150
      );
      sendTx(svm, ix, [trader]);

      const [fundedPda] = findFundedPda(trader.publicKey);
      const funded = fetchFundedTrader(svm, fundedPda);
      expect(funded.trader.toBase58()).to.equal(trader.publicKey.toBase58());
      expect(funded.level).to.equal(FundedLevel.Watchlist);
      expect(funded.revenueShareBps).to.equal(150);
    });
  });

  // ── Error Cases ─────────────────────────────────────────────────────────

  describe("error cases", () => {
    it("rejects double settlement (AlreadySettled)", () => {
      const ix = buildSettleChallengeIx(
        authority.publicKey,
        challengePda,
        trader.publicKey,
        {
          passed: false,
          payoutLamports: 0,
          finalPnlBps: -500,
          finalDrawdownBps: 800,
        }
      );

      const err = sendTxExpectFail(svm, ix, [authority]);
      expect(err.customErrorCode).to.equal(SHOOT_ERRORS.AlreadySettled);
      expect(err.logs.some((l) => l.includes("AlreadySettled"))).to.be.true;
    });

    it("rejects enrollment when challenge is full (ChallengeFull)", () => {
      const tinyId = "tiny-cap-test";

      sendTx(
        svm,
        buildInitializeChallengeIx(authority.publicKey, {
          challengeId: tinyId,
          tierName: "Test",
          entryFeeLamports: 1_000,
          profitTargetBps: 500,
          maxDrawdownBps: 500,
          dailyLossLimitBps: 300,
          durationSeconds: 3600,
          minCapitalUsd: 10,
          participantCap: 1,
        }),
        [authority]
      );

      const [tinyChallenge] = findChallengePda(authority.publicKey, tinyId);

      // First enrollment succeeds
      const t1 = Keypair.generate();
      svm.airdrop(t1.publicKey, AIRDROP_AMOUNT);
      sendTx(svm, buildEnrollIx(t1.publicKey, tinyChallenge, 100), [t1]);

      // Second enrollment should fail
      const t2 = Keypair.generate();
      svm.airdrop(t2.publicKey, AIRDROP_AMOUNT);

      const err = sendTxExpectFail(
        svm,
        buildEnrollIx(t2.publicKey, tinyChallenge, 100),
        [t2]
      );
      expect(err.customErrorCode).to.equal(SHOOT_ERRORS.ChallengeFull);
      expect(err.logs.some((l) => l.includes("ChallengeFull"))).to.be.true;
    });

    it("rejects settle by non-authority (Unauthorized)", () => {
      // Create a fresh challenge + enrollment to settle
      const unauthId = "unauth-test";
      sendTx(
        svm,
        buildInitializeChallengeIx(authority.publicKey, {
          challengeId: unauthId,
          tierName: "Test",
          entryFeeLamports: 1_000,
          profitTargetBps: 500,
          maxDrawdownBps: 500,
          dailyLossLimitBps: 300,
          durationSeconds: 3600,
          minCapitalUsd: 10,
          participantCap: 10,
        }),
        [authority]
      );

      const [unauthChallenge] = findChallengePda(authority.publicKey, unauthId);
      const unauthTrader = Keypair.generate();
      svm.airdrop(unauthTrader.publicKey, AIRDROP_AMOUNT);

      sendTx(svm, buildEnrollIx(unauthTrader.publicKey, unauthChallenge, 100), [
        unauthTrader,
      ]);

      // Try to settle with a random signer (not the authority)
      const imposter = Keypair.generate();
      svm.airdrop(imposter.publicKey, AIRDROP_AMOUNT);

      const ix = buildSettleChallengeIx(
        imposter.publicKey,
        unauthChallenge,
        unauthTrader.publicKey,
        {
          passed: true,
          payoutLamports: 0,
          finalPnlBps: 100,
          finalDrawdownBps: 50,
        }
      );

      const err = sendTxExpectFail(svm, ix, [imposter]);
      expect(err.customErrorCode).to.equal(SHOOT_ERRORS.Unauthorized);
      expect(err.logs.some((l) => l.includes("Unauthorized"))).to.be.true;
    });

    it("rejects enroll in non-Registration state (ChallengeNotOpen)", () => {
      // Create a challenge, then mutate its state byte to Live
      const stateId = "state-test";
      sendTx(
        svm,
        buildInitializeChallengeIx(authority.publicKey, {
          challengeId: stateId,
          tierName: "Test",
          entryFeeLamports: 1_000,
          profitTargetBps: 500,
          maxDrawdownBps: 500,
          dailyLossLimitBps: 300,
          durationSeconds: 3600,
          minCapitalUsd: 10,
          participantCap: 10,
        }),
        [authority]
      );

      const [stateChallenge] = findChallengePda(authority.publicKey, stateId);

      // Fetch raw account and flip state byte
      const acct = svm.getAccount(stateChallenge)!;
      const data = Buffer.from(acct.data);

      // Calculate offset of state field:
      // 8 (disc) + 32 (authority) + (4+10) (challenge_id "state-test") +
      // (4+4) (tier_name "Test") + 8 (entry_fee) + 2 (profit) + 2 (drawdown) +
      // 2 (daily_loss) + 8 (duration) + 8 (min_capital) + 2 (participant_cap) +
      // 2 (enrolled_count) = state byte
      const stateOffset =
        8 + 32 + (4 + stateId.length) + (4 + 4) + 8 + 2 + 2 + 2 + 8 + 8 + 2 + 2;

      // Verify current state is Registration (0)
      expect(data.readUInt8(stateOffset)).to.equal(0);

      // Set to Live (1)
      data.writeUInt8(1, stateOffset);

      // Write back using AccountInfo format
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

      const err = sendTxExpectFail(
        svm,
        buildEnrollIx(stateTrader.publicKey, stateChallenge, 100),
        [stateTrader]
      );
      expect(err.customErrorCode).to.equal(SHOOT_ERRORS.ChallengeNotOpen);
      expect(err.logs.some((l) => l.includes("ChallengeNotOpen"))).to.be.true;
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
