import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import { expect } from "chai";
import { Shoot } from "../target/types/shoot";

describe("shoot", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Shoot as Program<Shoot>;
  const authority = provider.wallet;

  // ── PDA helpers ───────────────────────────────────────────────────────────

  function findChallengePda(challengeId: string): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [
        Buffer.from("challenge"),
        authority.publicKey.toBuffer(),
        Buffer.from(challengeId),
      ],
      program.programId
    );
  }

  function findVaultPda(challengePda: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), challengePda.toBuffer()],
      program.programId
    );
  }

  function findEnrollmentPda(
    challengePda: PublicKey,
    trader: PublicKey
  ): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("enrollment"), challengePda.toBuffer(), trader.toBuffer()],
      program.programId
    );
  }

  function findFundedPda(trader: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("funded"), trader.toBuffer()],
      program.programId
    );
  }

  // ── Test data ─────────────────────────────────────────────────────────────

  const challengeId = "scout-sprint-0324";
  const trader = Keypair.generate();

  let challengePda: PublicKey;
  let challengeBump: number;
  let vaultPda: PublicKey;
  let enrollmentPda: PublicKey;

  before(() => {
    [challengePda, challengeBump] = findChallengePda(challengeId);
    [vaultPda] = findVaultPda(challengePda);
    [enrollmentPda] = findEnrollmentPda(challengePda, trader.publicKey);
  });

  // ── Tests ─────────────────────────────────────────────────────────────────

  it("initializes a challenge", async () => {
    const tx = await program.methods
      .initializeChallenge(
        challengeId,
        "Scout", // tier name
        new anchor.BN(10_000_000), // 0.01 SOL entry fee
        800, // 8% profit target
        500, // 5% max drawdown
        300, // 3% daily loss limit
        new anchor.BN(7 * 24 * 60 * 60), // 7 days
        new anchor.BN(50), // $50 min capital
        128 // participant cap
      )
      .accounts({
        authority: authority.publicKey,
        challenge: challengePda,
        vault: vaultPda,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const challenge = await program.account.challenge.fetch(challengePda);
    expect(challenge.challengeId).to.equal(challengeId);
    expect(challenge.tierName).to.equal("Scout");
    expect(challenge.entryFeeLamports.toNumber()).to.equal(10_000_000);
    expect(challenge.profitTargetBps).to.equal(800);
    expect(challenge.maxDrawdownBps).to.equal(500);
    expect(challenge.dailyLossLimitBps).to.equal(300);
    expect(challenge.minCapitalUsd.toNumber()).to.equal(50);
    expect(challenge.participantCap).to.equal(128);
    expect(challenge.enrolledCount).to.equal(0);
    expect(challenge.state).to.deep.equal({ registration: {} });
  });

  it("enrolls a trader with starting equity snapshot", async () => {
    // Airdrop to trader for entry fee + rent
    const airdropSig = await provider.connection.requestAirdrop(
      trader.publicKey,
      100_000_000 // 0.1 SOL
    );
    await provider.connection.confirmTransaction(airdropSig);

    const tx = await program.methods
      .enroll(new anchor.BN(500)) // $500 starting equity
      .accounts({
        trader: trader.publicKey,
        challenge: challengePda,
        enrollment: enrollmentPda,
        vault: vaultPda,
        systemProgram: SystemProgram.programId,
      })
      .signers([trader])
      .rpc();

    const enrollment = await program.account.enrollment.fetch(enrollmentPda);
    expect(enrollment.trader.toBase58()).to.equal(trader.publicKey.toBase58());
    expect(enrollment.startingEquityUsd.toNumber()).to.equal(500);
    expect(enrollment.settled).to.be.false;

    // Verify enrolled count incremented
    const challenge = await program.account.challenge.fetch(challengePda);
    expect(challenge.enrolledCount).to.equal(1);
  });

  it("settles a challenge (pass)", async () => {
    const tx = await program.methods
      .settleChallenge(
        true, // passed
        new anchor.BN(5_000_000), // 0.005 SOL payout
        1500, // +15% PnL
        300 // 3% max drawdown
      )
      .accounts({
        authority: authority.publicKey,
        challenge: challengePda,
        enrollment: enrollmentPda,
        trader: trader.publicKey,
        vault: vaultPda,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const enrollment = await program.account.enrollment.fetch(enrollmentPda);
    expect(enrollment.settled).to.be.true;
    expect(enrollment.passed).to.be.true;
    expect(enrollment.finalPnlBps).to.equal(1500);
    expect(enrollment.finalDrawdownBps).to.equal(300);
  });

  it("rejects double settlement", async () => {
    try {
      await program.methods
        .settleChallenge(false, new anchor.BN(0), -500, 800)
        .accounts({
          authority: authority.publicKey,
          challenge: challengePda,
          enrollment: enrollmentPda,
          trader: trader.publicKey,
          vault: vaultPda,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      expect.fail("Should have thrown AlreadySettled error");
    } catch (err: unknown) {
      expect(
        (err as { error: { errorCode: { code: string } } }).error.errorCode.code
      ).to.equal("AlreadySettled");
    }
  });

  it("claims funded trader status", async () => {
    const [fundedPda] = findFundedPda(trader.publicKey);

    const tx = await program.methods
      .claimFundedStatus(
        { watchlist: {} }, // FundedLevel::Watchlist
        150 // 150 bps revenue share
      )
      .accounts({
        trader: trader.publicKey,
        fundedTrader: fundedPda,
        systemProgram: SystemProgram.programId,
      })
      .signers([trader])
      .rpc();

    const funded = await program.account.fundedTrader.fetch(fundedPda);
    expect(funded.trader.toBase58()).to.equal(trader.publicKey.toBase58());
    expect(funded.revenueShareBps).to.equal(150);
    expect(funded.level).to.deep.equal({ watchlist: {} });
  });

  it("rejects enrollment when challenge is full", async () => {
    // Create a challenge with cap of 1
    const tinyId = "tiny-cap-test";
    const [tinyChallenge] = findChallengePda(tinyId);
    const [tinyVault] = findVaultPda(tinyChallenge);

    await program.methods
      .initializeChallenge(
        tinyId,
        "Test",
        new anchor.BN(1_000),
        500,
        500,
        300,
        new anchor.BN(3600),
        new anchor.BN(10),
        1 // cap of 1
      )
      .accounts({
        authority: authority.publicKey,
        challenge: tinyChallenge,
        vault: tinyVault,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    // First enrollment should succeed
    const trader1 = Keypair.generate();
    const airdropSig1 = await provider.connection.requestAirdrop(
      trader1.publicKey,
      100_000_000
    );
    await provider.connection.confirmTransaction(airdropSig1);

    const [enrollment1] = findEnrollmentPda(tinyChallenge, trader1.publicKey);
    await program.methods
      .enroll(new anchor.BN(100))
      .accounts({
        trader: trader1.publicKey,
        challenge: tinyChallenge,
        enrollment: enrollment1,
        vault: tinyVault,
        systemProgram: SystemProgram.programId,
      })
      .signers([trader1])
      .rpc();

    // Second enrollment should fail (cap reached)
    const trader2 = Keypair.generate();
    const airdropSig2 = await provider.connection.requestAirdrop(
      trader2.publicKey,
      100_000_000
    );
    await provider.connection.confirmTransaction(airdropSig2);

    const [enrollment2] = findEnrollmentPda(tinyChallenge, trader2.publicKey);
    try {
      await program.methods
        .enroll(new anchor.BN(100))
        .accounts({
          trader: trader2.publicKey,
          challenge: tinyChallenge,
          enrollment: enrollment2,
          vault: tinyVault,
          systemProgram: SystemProgram.programId,
        })
        .signers([trader2])
        .rpc();
      expect.fail("Should have thrown ChallengeFull error");
    } catch (err: unknown) {
      expect(
        (err as { error: { errorCode: { code: string } } }).error.errorCode.code
      ).to.equal("ChallengeFull");
    }
  });

  // ── PDA derivation tests ──────────────────────────────────────────────────

  it("challenge PDA is deterministic", () => {
    const [pda1] = findChallengePda("test-123");
    const [pda2] = findChallengePda("test-123");
    expect(pda1.toBase58()).to.equal(pda2.toBase58());
  });

  it("different challenge IDs produce different PDAs", () => {
    const [pda1] = findChallengePda("challenge-a");
    const [pda2] = findChallengePda("challenge-b");
    expect(pda1.toBase58()).to.not.equal(pda2.toBase58());
  });

  it("enrollment PDA is unique per trader per challenge", () => {
    const traderA = Keypair.generate();
    const traderB = Keypair.generate();
    const [enrollA] = findEnrollmentPda(challengePda, traderA.publicKey);
    const [enrollB] = findEnrollmentPda(challengePda, traderB.publicKey);
    expect(enrollA.toBase58()).to.not.equal(enrollB.toBase58());
  });

  it("funded trader PDA is unique per trader", () => {
    const traderA = Keypair.generate();
    const traderB = Keypair.generate();
    const [fundedA] = findFundedPda(traderA.publicKey);
    const [fundedB] = findFundedPda(traderB.publicKey);
    expect(fundedA.toBase58()).to.not.equal(fundedB.toBase58());
  });
});
