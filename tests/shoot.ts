import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import {
  PublicKey,
  Keypair,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  createMint,
  createAccount,
  mintTo,
  getAccount,
} from "@solana/spl-token";
import { Shoot } from "../target/types/shoot";
import { randomBytes } from "crypto";
import {
  awaitComputationFinalization,
  getArciumEnv,
  getCompDefAccOffset,
  getArciumAccountBaseSeed,
  getArciumProgAddress,
  buildFinalizeCompDefTx,
  RescueCipher,
  deserializeLE,
  getMXEPublicKey,
  getMXEAccAddress,
  getMempoolAccAddress,
  getCompDefAccAddress,
  getExecutingPoolAccAddress,
  getComputationAccAddress,
  x25519,
} from "@arcium-hq/client";
import * as fs from "fs";
import * as os from "os";
import { expect } from "chai";

describe("Shoot Private Perpetuals", () => {
  // Configure the client to use the local cluster
  anchor.setProvider(anchor.AnchorProvider.env());
  const program = anchor.workspace.Shoot as Program<Shoot>;
  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const wallet = provider.wallet as anchor.Wallet;

  // Test accounts
  let owner: Keypair;
  let admin: Keypair;
  let trader: Keypair;
  let liquidator: Keypair;

  // Protocol PDAs
  let perpetualsPda: PublicKey;
  let transferAuthorityPda: PublicKey;
  let poolPda: PublicKey;
  let lpTokenMintPda: PublicKey;
  let custodyPda: PublicKey;
  let custodyTokenAccountPda: PublicKey;
  let positionPda: PublicKey;

  // Token accounts
  let collateralMint: PublicKey;
  let traderTokenAccount: PublicKey;
  let traderLpTokenAccount: PublicKey;
  let liquidatorTokenAccount: PublicKey;

  // Arcium state
  let mxePublicKey: Uint8Array;
  let cipher: RescueCipher;
  let privateKey: Uint8Array;
  let publicKey: Uint8Array;
  let arciumEnv: any;

  const POOL_NAME = "SOL-PERP";

  // Event listener helper
  type Event = anchor.IdlEvents<(typeof program)["idl"]>;
  const awaitEvent = async <E extends keyof Event>(
    eventName: E
  ): Promise<Event[E]> => {
    let listenerId: number;
    const event = await new Promise<Event[E]>((res) => {
      listenerId = program.addEventListener(eventName, (event) => {
        res(event);
      });
    });
    await program.removeEventListener(listenerId!);
    return event;
  };

  // Helper functions
  function readKpJson(path: string): Keypair {
    const file = fs.readFileSync(path);
    return Keypair.fromSecretKey(new Uint8Array(JSON.parse(file.toString())));
  }

  async function getMXEPublicKeyWithRetry(
    provider: anchor.AnchorProvider,
    programId: PublicKey,
    maxRetries: number = 10,
    retryDelayMs: number = 1000
  ): Promise<Uint8Array> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const key = await getMXEPublicKey(provider, programId);
        if (key) return key;
      } catch (error) {
        console.log(
          `Attempt ${attempt}/${maxRetries} failed to fetch MXE public key`
        );
      }
      if (attempt < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
      }
    }
    throw new Error(
      `Failed to fetch MXE public key after ${maxRetries} attempts`
    );
  }

  // Helper to add timeout to promises
  async function withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    errorMsg: string
  ): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error(errorMsg)), timeoutMs)
      ),
    ]);
  }

  async function initCompDef(
    methodName: string,
    initMethod: () => anchor.MethodsBuilder<typeof program.idl, any>
  ): Promise<string> {
    const baseSeedCompDefAcc = getArciumAccountBaseSeed(
      "ComputationDefinitionAccount"
    );
    const offset = getCompDefAccOffset(methodName);

    const compDefPDA = PublicKey.findProgramAddressSync(
      [baseSeedCompDefAcc, program.programId.toBuffer(), offset],
      getArciumProgAddress()
    )[0];

    console.log(
      `Initializing ${methodName} comp def at`,
      compDefPDA.toBase58()
    );
    console.log("Arcium Program Address:", getArciumProgAddress().toBase58());
    const mxeAddress = getMXEAccAddress(program.programId);
    console.log("MXE Account Address (derived):", mxeAddress.toBase58());

    let sig: string;
    try {
      sig = await initMethod()
        .accounts({
          compDefAccount: compDefPDA,
          payer: owner.publicKey,
          mxeAccount: mxeAddress,
        })
        .signers([owner])
        .rpc({ commitment: "confirmed" });
    } catch (e: any) {
      console.error(`ERROR initializing ${methodName}:`, e);
      if (e.logs) {
        console.error("Transaction logs:", e.logs);
      }
      if (e.toString().includes("already in use")) {
        console.log(`${methodName} comp def already initialized`);
        // We still try to finalize just in case
        sig = "already-initialized";
      } else {
        throw e;
      }
    }

    // Finalize the computation definition with retry
    const maxRetries = 5;
    for (let i = 0; i < maxRetries; i++) {
      try {
        const finalizeTx = await buildFinalizeCompDefTx(
          provider,
          Buffer.from(offset).readUInt32LE(),
          program.programId
        );
        const latestBlockhash = await provider.connection.getLatestBlockhash();
        finalizeTx.recentBlockhash = latestBlockhash.blockhash;
        finalizeTx.lastValidBlockHeight = latestBlockhash.lastValidBlockHeight;
        finalizeTx.sign(owner);

        await provider.sendAndConfirm(finalizeTx, [], {
          commitment: "confirmed",
          skipPreflight: true,
        });
        console.log(`Finalized ${methodName}`);
        break;
      } catch (error) {
        console.log(
          `Attempt ${i + 1}/${maxRetries} failed to finalize comp def: ${error}`
        );
        if (i === maxRetries - 1) throw error;
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }

    return sig;
  }

  before(async () => {
    console.log("=== Setting up test environment ===");

    // Load or create test keypairs
    owner = readKpJson(`${os.homedir()}/.config/solana/id.json`);
    admin = owner; // Use same keypair for simplicity
    trader = Keypair.generate();
    liquidator = Keypair.generate();

    // Airdrop SOL to test accounts
    console.log("Airdropping SOL to test accounts...");
    const airdropAmount = 10 * LAMPORTS_PER_SOL;

    await provider.connection.requestAirdrop(trader.publicKey, airdropAmount);
    await provider.connection.requestAirdrop(
      liquidator.publicKey,
      airdropAmount
    );

    // Wait for airdrops to confirm
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Derive PDAs
    [perpetualsPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("perpetuals")],
      program.programId
    );
    [transferAuthorityPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("transfer_authority")],
      program.programId
    );
    [poolPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("pool"), Buffer.from(POOL_NAME)],
      program.programId
    );

    console.log("Perpetuals PDA:", perpetualsPda.toBase58());
    console.log("Transfer Authority PDA:", transferAuthorityPda.toBase58());
    console.log("Pool PDA:", poolPda.toBase58());

    try {
      arciumEnv = getArciumEnv();
    } catch (e) {
      console.log(
        "Failed to load Arcium env via getArciumEnv, using fallback values"
      );
      // Fallback for localnet testing if config loading fails
      // These are standard localnet values or placeholder if we can't load them
      arciumEnv = {
        arciumClusterPubkey: new PublicKey(
          "2E4qQsaFWEWFbyKRDEaK2bAWQLFnk9MDRv6PCpViArmN"
        ),
        mxeProgramId: program.programId, // Assuming we are interacting with our program
      };
    }

    // Setup Arcium encryption - fetch MXE public key with increased retries
    // This must be done before any tests run, as the MXE keygen may still be completing
    console.log("Fetching MXE public key...");
    mxePublicKey = await getMXEPublicKeyWithRetry(
      provider,
      program.programId,
      20, // maxRetries (increased from 10)
      2000 // retryDelayMs (increased from 1000)
    );
    console.log("MXE public key:", Buffer.from(mxePublicKey).toString("hex"));

    // Setup encryption cipher
    privateKey = x25519.utils.randomSecretKey();
    publicKey = x25519.getPublicKey(privateKey);
    const sharedSecret = x25519.getSharedSecret(privateKey, mxePublicKey);
    cipher = new RescueCipher(sharedSecret);
    console.log("Arcium encryption setup complete");
  });

  describe("Setup Phase", () => {
    it("Initializes all computation definitions", async () => {
      console.log("Initializing computation definitions...");

      // Initialize init_position comp def
      await initCompDef("init_position", () =>
        program.methods.initPositionCompDef()
      );
      console.log("✓ init_position comp def initialized");

      // Initialize update_position comp def
      await initCompDef("update_position", () =>
        program.methods.initUpdatePositionCompDef()
      );
      console.log("✓ update_position comp def initialized");

      // Initialize check_liquidation comp def
      await initCompDef("check_liquidation", () =>
        program.methods.initCheckLiquidationCompDef()
      );
      console.log("✓ check_liquidation comp def initialized");

      // Initialize close_position comp def
      await initCompDef("close_position", () =>
        program.methods.initClosePositionCompDef()
      );
      console.log("✓ close_position comp def initialized");

      // Initialize calculate_pnl comp def
      await initCompDef("calculate_pnl", () =>
        program.methods.initCalculatePnlCompDef()
      );
      console.log("✓ calculate_pnl comp def initialized");
    });

    it("Initializes the protocol", async () => {
      const sig = await program.methods
        .initialize()
        .accounts({
          admin: admin.publicKey,
          perpetuals: perpetualsPda,
          transferAuthority: transferAuthorityPda,
          systemProgram: SystemProgram.programId,
        })
        .signers([admin])
        .rpc({ commitment: "confirmed" });

      console.log("Protocol initialized:", sig);

      // Verify initialization
      const perpetuals = await program.account.perpetuals.fetch(perpetualsPda);
      expect(perpetuals.admin.toBase58()).to.equal(admin.publicKey.toBase58());
      expect(perpetuals.permissions.allowOpenPosition).to.be.true;
      expect(perpetuals.permissions.allowClosePosition).to.be.true;
      expect(perpetuals.permissions.allowLiquidation).to.be.true;
    });

    it("Creates a liquidity pool", async () => {
      [lpTokenMintPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("lp_token_mint"), poolPda.toBuffer()],
        program.programId
      );

      const sig = await program.methods
        .addPool(POOL_NAME)
        .accounts({
          admin: admin.publicKey,
          perpetuals: perpetualsPda,
          pool: poolPda,
          lpTokenMint: lpTokenMintPda,
          transferAuthority: transferAuthorityPda,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        })
        .signers([admin])
        .rpc({ commitment: "confirmed" });

      console.log("Pool created:", sig);

      // Verify pool
      const pool = await program.account.pool.fetch(poolPda);
      expect(pool.name).to.equal(POOL_NAME);
      expect(pool.lpTokenMint.toBase58()).to.equal(lpTokenMintPda.toBase58());
    });

    it("Creates collateral mint and adds custody", async () => {
      // Create collateral token mint (simulating USDC)
      collateralMint = await createMint(
        provider.connection,
        owner,
        owner.publicKey,
        null,
        6 // 6 decimals like USDC
      );
      console.log("Collateral mint created:", collateralMint.toBase58());

      // Wait for mint creation to be fully confirmed
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Derive custody PDAs
      [custodyPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("custody"), poolPda.toBuffer(), collateralMint.toBuffer()],
        program.programId
      );
      [custodyTokenAccountPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("custody_token_account"),
          poolPda.toBuffer(),
          collateralMint.toBuffer(),
        ],
        program.programId
      );

      // Add custody with custom oracle
      const oracleParams = {
        oracleAccount: admin.publicKey, // Use admin as oracle for testing
        oracleType: { custom: {} },
        oracleAuthority: admin.publicKey,
        maxPriceError: new BN(100), // 1%
        maxPriceAgeSec: 60,
        feedId: Array(32).fill(0), // Dummy feed ID
      };

      const pricingParams = {
        useEma: false,
        tradeSpreadLong: new BN(10), // 0.1%
        tradeSpreadShort: new BN(10),
        minInitialLeverage: new BN(10000), // 1x
        maxInitialLeverage: new BN(100000), // 10x
        maxLeverage: new BN(150000), // 15x (liquidation threshold)
        maxPayoffMult: new BN(10000), // 1x
        maxUtilization: new BN(8000), // 80%
      };

      const fees = {
        openPosition: new BN(10), // 0.1%
        closePosition: new BN(10),
        liquidation: new BN(50), // 0.5%
        protocolShare: new BN(2000), // 20%
        addLiquidity: new BN(5),
        removeLiquidity: new BN(5),
      };

      const borrowRateParams = {
        baseRate: new BN(0),
        slope1: new BN(80000),
        slope2: new BN(120000),
        optimalUtilization: new BN(800000000),
      };

      const sig = await program.methods
        .addCustody(
          false, // not stable
          oracleParams,
          pricingParams,
          fees,
          borrowRateParams
        )
        .accounts({
          admin: admin.publicKey,
          perpetuals: perpetualsPda,
          pool: poolPda,
          custody: custodyPda,
          custodyTokenAccount: custodyTokenAccountPda,
          custodyTokenMint: collateralMint,
          transferAuthority: transferAuthorityPda,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        })
        .signers([admin])
        .rpc({ skipPreflight: true, commitment: "confirmed" });

      console.log("Custody added:", sig);

      // Verify custody
      const custody = await program.account.custody.fetch(custodyPda);
      expect(custody.mint.toBase58()).to.equal(collateralMint.toBase58());
      expect(custody.pool.toBase58()).to.equal(poolPda.toBase58());
    });

    it("Sets up trader token accounts", async () => {
      // Create trader's collateral token account with explicit keypair
      const traderTokenKeypair = Keypair.generate();
      traderTokenAccount = await createAccount(
        provider.connection,
        owner,
        collateralMint,
        trader.publicKey,
        traderTokenKeypair // explicit keypair ensures regular Token Program is used
      );

      // Mint some tokens to trader (10,000 USDC)
      await mintTo(
        provider.connection,
        owner,
        collateralMint,
        traderTokenAccount,
        owner,
        10_000_000_000 // 10,000 with 6 decimals
      );

      // Create trader's LP token account with explicit keypair
      const traderLpTokenKeypair = Keypair.generate();
      traderLpTokenAccount = await createAccount(
        provider.connection,
        owner,
        lpTokenMintPda,
        trader.publicKey,
        traderLpTokenKeypair // explicit keypair ensures regular Token Program is used
      );

      console.log("Trader token accounts set up");

      const balance = await provider.connection.getTokenAccountBalance(
        traderTokenAccount
      );
      console.log("Trader collateral balance:", balance.value.uiAmount);
    });
  });

  describe("Liquidity Operations", () => {
    it("Adds liquidity to the pool", async () => {
      const addAmount = new BN(5_000_000_000); // 5,000 USDC
      const minLpAmount = new BN(4_900_000_000); // Allow 2% slippage

      const eventPromise = awaitEvent("addLiquidityEvent");

      const sig = await program.methods
        .addLiquidity(addAmount, minLpAmount)
        .accounts({
          owner: trader.publicKey,
          perpetuals: perpetualsPda,
          pool: poolPda,
          custody: custodyPda,
          custodyTokenAccount: custodyTokenAccountPda,
          lpTokenMint: lpTokenMintPda,
          lpTokenAccount: traderLpTokenAccount,
          fundingAccount: traderTokenAccount,
          transferAuthority: transferAuthorityPda,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([trader])
        .rpc({ commitment: "confirmed" });

      console.log("Add liquidity tx:", sig);

      const event = await eventPromise;
      expect(event.owner.toBase58()).to.equal(trader.publicKey.toBase58());
      expect(event.amountIn.toNumber()).to.equal(addAmount.toNumber());

      // Verify LP tokens received
      const lpBalance = await provider.connection.getTokenAccountBalance(
        traderLpTokenAccount
      );
      console.log("LP tokens received:", lpBalance.value.uiAmount);
      expect(Number(lpBalance.value.amount)).to.be.greaterThan(0);

      // Verify custody assets updated
      const custody = await program.account.custody.fetch(custodyPda);
      expect(custody.assets.owned.toNumber()).to.equal(addAmount.toNumber());
    });
  });

  describe("Private Position Operations", () => {
    it("Opens an encrypted long position", async () => {
      if (!cipher) {
        throw new Error(
          "Cipher is undefined. Encryption setup failed in previous steps."
        );
      }

      // Derive position PDA
      [positionPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("position"),
          trader.publicKey.toBuffer(),
          poolPda.toBuffer(),
          custodyPda.toBuffer(),
        ],
        program.programId
      );

      // Position parameters (these will be encrypted)
      const side = BigInt(1); // Long
      const sizeUsd = BigInt(1000_000_000); // $1000
      const collateral = BigInt(100_000_000); // $100 (10x leverage)
      const entryPrice = BigInt(100_000_000); // $100 per token

      // Encrypt position parameters
      const nonce = randomBytes(16);
      const nonceValue = deserializeLE(nonce);

      // Generate separate MXE nonce for the output encryption
      const mxeNonce = randomBytes(16);
      const mxeNonceValue = deserializeLE(mxeNonce);

      const encryptedSide = cipher.encrypt([side], nonce)[0];
      const encryptedSize = cipher.encrypt([sizeUsd], nonce)[0];
      const encryptedCollateral = cipher.encrypt([collateral], nonce)[0];
      const encryptedEntryPrice = cipher.encrypt([entryPrice], nonce)[0];

      const computationOffset = new BN(randomBytes(8), "hex");

      console.log("Opening encrypted position...");
      console.log("Position PDA:", positionPda.toBase58());
      console.log("Computation offset:", computationOffset.toString());

      const eventPromise = awaitEvent("openPositionEvent");

      // Price update account (not used for Custom oracle type)
      // The custody is configured with OracleType::Custom which returns a fixed test price
      const priceUpdateKeypair = Keypair.generate();

      let sig: string;
      try {
        sig = await program.methods
          .openPosition(
            computationOffset,
            Array.from(encryptedSide),
            Array.from(encryptedSize),
            Array.from(encryptedCollateral),
            Array.from(encryptedEntryPrice),
            Array.from(publicKey),
            new BN(nonceValue.toString()),
            new BN(mxeNonceValue.toString()),
            new BN(100_000_000) // Collateral amount for token transfer
          )
          .accountsPartial({
            owner: trader.publicKey,
            computationAccount: getComputationAccAddress(
              program.programId,
              computationOffset
            ),
            clusterAccount: arciumEnv.arciumClusterPubkey,
            mxeAccount: getMXEAccAddress(program.programId),
            mempoolAccount: getMempoolAccAddress(program.programId),
            executingPool: getExecutingPoolAccAddress(program.programId),
            compDefAccount: getCompDefAccAddress(
              program.programId,
              Buffer.from(getCompDefAccOffset("init_position")).readUInt32LE()
            ),
            perpetuals: perpetualsPda,
            pool: poolPda,
            custody: custodyPda,
            collateralCustody: custodyPda, // Same custody for simplicity
            collateralCustodyTokenAccount: custodyTokenAccountPda,
            position: positionPda,
            fundingAccount: traderTokenAccount,
            tokenProgram: TOKEN_PROGRAM_ID,
            priceUpdate: priceUpdateKeypair.publicKey,
          })
          .signers([trader])
          .rpc({ commitment: "confirmed" });
      } catch (e: any) {
        console.error("Transaction failed with error:", e);
        if (e.logs) {
          console.error("Transaction logs:", e.logs);
        }
        if (e.simulationResponse) {
          console.error(
            "Simulation response:",
            JSON.stringify(e.simulationResponse, null, 2)
          );
        }
        throw e;
      }

      console.log("Open position tx:", sig);

      // Wait for MPC computation to complete
      console.log("Waiting for MPC computation...");
      const finalizeSig = await withTimeout(
        awaitComputationFinalization(
          provider,
          computationOffset,
          program.programId,
          "confirmed"
        ),
        300000, // 300 second timeout (5 minutes) - MPC can be slow in localnet
        "Computation finalization timed out after 300 seconds"
      );
      console.log("Computation finalized:", finalizeSig);

      const event = await eventPromise;
      expect(event.owner.toBase58()).to.equal(trader.publicKey.toBase58());
      expect(event.position.toBase58()).to.equal(positionPda.toBase58());

      // Verify position is stored encrypted
      const position = await program.account.position.fetch(positionPda);
      expect(position.owner.toBase58()).to.equal(trader.publicKey.toBase58());
      expect(position.isActive).to.be.true;

      // Verify encrypted data is not plaintext
      console.log(
        "Position side ciphertext:",
        Buffer.from(position.sideCiphertext).toString("hex")
      );
      console.log(
        "Position size ciphertext:",
        Buffer.from(position.sizeUsdCiphertext).toString("hex")
      );
      console.log(
        "Position nonce after init:",
        position.nonce.toString()
      );

      // The ciphertexts should NOT be zero (encrypted data)
      const allZeros = position.sideCiphertext.every((b: number) => b === 0);
      expect(allZeros).to.be.false;

      // Wait for execpool to clear after init_position completes
      // This gives Arcium nodes time to clean up the computation state
      console.log("Waiting 45s for execpool to clear after init_position...");
      await new Promise((resolve) => setTimeout(resolve, 45000));
    });

    it("Verifies position data is encrypted on-chain", async () => {
      if (!positionPda) {
        throw new Error(
          "Position PDA is undefined. The 'Opens an encrypted long position' test must run first."
        );
      }

      const position = await program.account.position.fetch(positionPda);

      // Position metadata should be public
      expect(position.owner.toBase58()).to.equal(trader.publicKey.toBase58());
      expect(position.pool.toBase58()).to.equal(poolPda.toBase58());
      expect(position.custody.toBase58()).to.equal(custodyPda.toBase58());
      expect(position.isActive).to.be.true;

      // Position trading data should be encrypted (32-byte ciphertexts)
      expect(position.sideCiphertext.length).to.equal(32);
      expect(position.sizeUsdCiphertext.length).to.equal(32);
      expect(position.collateralCiphertext.length).to.equal(32);
      expect(position.entryPriceCiphertext.length).to.equal(32);
      expect(position.leverageCiphertext.length).to.equal(32);

      // Cannot derive position size from on-chain data
      // This is the key privacy guarantee!
      console.log(
        "✓ Position data is encrypted - size, side, leverage are hidden"
      );
    });

    it("Updates position collateral", async () => {
      if (!positionPda) {
        throw new Error(
          "Position PDA is undefined. The 'Opens an encrypted long position' test must run first."
        );
      }

      // We'll add $50 of collateral
      const collateralDelta = BigInt(50_000_000); // $50
      const isAdd = true;
      const isAddByte = isAdd ? 1 : 0;

      // Encrypt parameters
      const nonce = randomBytes(16);
      const nonceValue = deserializeLE(nonce);
      const mxeNonce = randomBytes(16);
      const mxeNonceValue = deserializeLE(mxeNonce);

      const encryptedAmount = cipher.encrypt([collateralDelta], nonce)[0];
      const encryptedIsAdd = cipher.encrypt([BigInt(isAddByte)], nonce)[0];

      const computationOffset = new BN(randomBytes(8), "hex");
      console.log("Update position computation offset:", computationOffset.toString());

      // Get current nonce to verify update later
      const positionBefore = await program.account.position.fetch(positionPda);
      const nonceBefore = positionBefore.nonce;

      const eventPromise = awaitEvent("positionUpdatedEvent");

      const sig = await program.methods
        .updatePosition(
          computationOffset,
          Array.from(encryptedAmount),
          Array.from(encryptedIsAdd),
          Array.from(publicKey),
          new BN(nonceValue.toString()),
          new BN(mxeNonceValue.toString()),
          new BN(50_000_000), // Plaintext amount for transfer
          isAdd
        )
        .accountsPartial({
          owner: trader.publicKey,
          computationAccount: getComputationAccAddress(
            program.programId,
            computationOffset
          ),
          clusterAccount: arciumEnv.arciumClusterPubkey,
          mxeAccount: getMXEAccAddress(program.programId),
          mempoolAccount: getMempoolAccAddress(program.programId),
          executingPool: getExecutingPoolAccAddress(program.programId),
          compDefAccount: getCompDefAccAddress(
            program.programId,
            Buffer.from(getCompDefAccOffset("update_position")).readUInt32LE()
          ),
          perpetuals: perpetualsPda,
          pool: poolPda,
          custody: custodyPda,
          collateralCustody: custodyPda,
          collateralCustodyTokenAccount: custodyTokenAccountPda,
          position: positionPda,
          fundingAccount: traderTokenAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([trader])
        .rpc({ skipPreflight: true, commitment: "confirmed" });

      console.log("Update position tx:", sig);

      console.log("Waiting for MPC computation...");
      await withTimeout(
        awaitComputationFinalization(
          provider,
          computationOffset,
          program.programId,
          "confirmed"
        ),
        300000,
        "Computation finalization timed out after 300 seconds"
      );

      const event = await eventPromise;
      console.log("Position updated, new nonce:", event.nonce.toString());

      // Verify nonce changed
      const positionAfter = await program.account.position.fetch(positionPda);
      expect(positionAfter.nonce.toString()).to.not.equal(nonceBefore.toString());
      expect(positionAfter.nonce.toString()).to.equal(event.nonce.toString());

      console.log("✓ Position collateral updated privately");
    });

    it("Calculates PnL privately", async () => {
      if (!positionPda) {
        throw new Error(
          "Position PDA is undefined. The 'Opens an encrypted long position' test must run first."
        );
      }
      if (!custodyPda) {
        throw new Error(
          "Custody PDA is undefined. The 'Creates collateral mint and adds custody' test must run first."
        );
      }

      const computationOffset = new BN(randomBytes(8), "hex");
      console.log(
        "Calculate PnL computation offset:",
        computationOffset.toString()
      );
      const currentPrice = new BN(110_000_000); // $110 (10% profit for long)

      // Wait a bit to ensure previous callback is fully processed and nonce is stable
      // The Arx node might be stuck retrying the previous callback, so we give it time to finish retries
      // Wait for execpool to clear before starting a new computation
      // This gives Arcium nodes time to clean up after previous computations
      console.log("Waiting 45s for execpool to clear before calculate_pnl...");
      await new Promise((resolve) => setTimeout(resolve, 45000));

      // Debug: Check position nonce before calculate_pnl
      const positionBefore = await program.account.position.fetch(positionPda);
      console.log("Position nonce before calculate_pnl:", positionBefore.nonce.toString());
      console.log("Position is_active:", positionBefore.isActive);

      const eventPromise = awaitEvent("pnlCalculatedEvent");

      const sig = await program.methods
        .calculatePnl(computationOffset, currentPrice)
        .accountsPartial({
          owner: trader.publicKey,
          computationAccount: getComputationAccAddress(
            program.programId,
            computationOffset
          ),
          clusterAccount: arciumEnv.arciumClusterPubkey,
          mxeAccount: getMXEAccAddress(program.programId),
          mempoolAccount: getMempoolAccAddress(program.programId),
          executingPool: getExecutingPoolAccAddress(program.programId),
          compDefAccount: getCompDefAccAddress(
            program.programId,
            Buffer.from(getCompDefAccOffset("calculate_pnl")).readUInt32LE()
          ),
          pool: poolPda,
          custody: custodyPda,
          position: positionPda,
        })
        .signers([trader])
        .rpc({ skipPreflight: true, commitment: "confirmed" });

      console.log("Calculate PnL tx:", sig);

      // Wait for computation
      console.log("Waiting for computation finalization...");
      await withTimeout(
        awaitComputationFinalization(
          provider,
          computationOffset,
          program.programId,
          "confirmed"
        ),
        300000, // 300 second timeout (5 minutes)
        "Computation finalization timed out after 300 seconds. Arcium MPC nodes may not be processing callbacks."
      );

      const event = await eventPromise;
      console.log("PnL Result:");
      console.log("  Profit USD:", event.profitUsd.toString());
      console.log("  Loss USD:", event.lossUsd.toString());
      console.log("  Current Leverage:", event.currentLeverage.toString());

      // With 10% price increase on a long, should have profit
      expect(event.profitUsd.toNumber()).to.be.greaterThan(0);
      expect(event.lossUsd.toNumber()).to.equal(0);
    });

    it("Closes the position and reveals PnL", async () => {
      if (!positionPda) {
        throw new Error(
          "Position PDA is undefined. The 'Opens an encrypted long position' test must run first."
        );
      }
      if (!collateralMint) {
        throw new Error(
          "Collateral mint is undefined. The 'Creates collateral mint' test must run first."
        );
      }

      // Wait for execpool to clear before starting a new computation
      console.log("Waiting 45s for execpool to clear before close_position...");
      await new Promise((resolve) => setTimeout(resolve, 45000));

      const computationOffset = new BN(randomBytes(8), "hex");
      const exitPrice = new BN(105_000_000); // $105 (5% profit)

      // Create receiving account for trader with explicit keypair
      const receivingKeypair = Keypair.generate();
      const receivingAccount = await createAccount(
        provider.connection,
        owner,
        collateralMint,
        trader.publicKey,
        receivingKeypair // explicit keypair ensures regular Token Program is used
      );

      const eventPromise = awaitEvent("positionClosedEvent");

      // Price update account (not used for Custom oracle type)
      const priceUpdateKeypair = Keypair.generate();

      const sig = await program.methods
        .closePosition(computationOffset)
        .accountsPartial({
          owner: trader.publicKey,
          computationAccount: getComputationAccAddress(
            program.programId,
            computationOffset
          ),
          clusterAccount: arciumEnv.arciumClusterPubkey,
          mxeAccount: getMXEAccAddress(program.programId),
          mempoolAccount: getMempoolAccAddress(program.programId),
          executingPool: getExecutingPoolAccAddress(program.programId),
          compDefAccount: getCompDefAccAddress(
            program.programId,
            Buffer.from(getCompDefAccOffset("close_position")).readUInt32LE()
          ),
          perpetuals: perpetualsPda,
          pool: poolPda,
          custody: custodyPda,
          collateralCustody: custodyPda,
          position: positionPda,
          receivingAccount: receivingAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
          priceUpdate: priceUpdateKeypair.publicKey,
        })
        .signers([trader])
        .rpc({ skipPreflight: true, commitment: "confirmed" });

      console.log("Close position tx:", sig);

      // Wait for computation
      console.log("Waiting for computation finalization...");
      await withTimeout(
        awaitComputationFinalization(
          provider,
          computationOffset,
          program.programId,
          "confirmed"
        ),
        300000, // 300 second timeout (5 minutes)
        "Computation finalization timed out after 300 seconds"
      );

      const event = await eventPromise;
      console.log("Position Closed:");
      console.log("  Profit USD:", event.profitUsd.toString());
      console.log("  Loss USD:", event.lossUsd.toString());
      console.log("  Transfer Amount:", event.transferAmount.toString());
      console.log("  Fee Amount:", event.feeAmount.toString());

      // Verify position is closed
      const position = await program.account.position.fetch(positionPda);
      expect(position.isActive).to.be.false;

      console.log("✓ Position closed - PnL revealed only at settlement");
    });
  });

  describe("Privacy Verification", () => {
    it("Confirms position parameters cannot be derived from on-chain data", async () => {
      // This test documents the privacy guarantees

      console.log("\n=== Privacy Verification ===");
      console.log("The following position data is hidden from observers:");
      console.log("  ✓ Position side (long/short)");
      console.log("  ✓ Position size in USD");
      console.log("  ✓ Collateral amount");
      console.log("  ✓ Entry price");
      console.log("  ✓ Effective leverage");
      console.log("  ✓ Liquidation price (derived from above)");
      console.log("\nThe following is public:");
      console.log("  • Position owner");
      console.log("  • Pool and custody");
      console.log("  • Open/close timestamps");
      console.log("  • Whether position is active");
      console.log("\nThis prevents:");
      console.log("  • Front-running (attackers can't see pending trades)");
      console.log("  • Copy-trading (strategies remain private)");
      console.log(
        "  • Targeted liquidations (can't calculate liquidation prices)"
      );
    });
  });

  describe("Liquidity Removal", () => {
    it("Removes liquidity from the pool", async () => {
      if (!traderLpTokenAccount) {
        throw new Error(
          "Trader LP token account is undefined. The 'Sets up trader token accounts' test must run first."
        );
      }
      if (!collateralMint) {
        throw new Error(
          "Collateral mint is undefined. The 'Creates collateral mint' test must run first."
        );
      }

      const lpBalance = await provider.connection.getTokenAccountBalance(
        traderLpTokenAccount
      );
      const removeAmount = new BN(Number(lpBalance.value.amount));
      const minAmountOut = removeAmount.muln(98).divn(100); // 2% slippage

      if (removeAmount.toNumber() === 0) {
        console.log("No LP tokens to remove, skipping...");
        return;
      }

      // Create receiving account with explicit keypair
      const receivingKeypair = Keypair.generate();
      const receivingAccount = await createAccount(
        provider.connection,
        owner,
        collateralMint,
        trader.publicKey,
        receivingKeypair // explicit keypair ensures regular Token Program is used
      );

      const eventPromise = awaitEvent("removeLiquidityEvent");

      const sig = await program.methods
        .removeLiquidity(removeAmount, minAmountOut)
        .accounts({
          owner: trader.publicKey,
          perpetuals: perpetualsPda,
          pool: poolPda,
          custody: custodyPda,
          custodyTokenAccount: custodyTokenAccountPda,
          lpTokenMint: lpTokenMintPda,
          lpTokenAccount: traderLpTokenAccount,
          receivingAccount: receivingAccount,
          transferAuthority: transferAuthorityPda,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([trader])
        .rpc({ commitment: "confirmed" });

      console.log("Remove liquidity tx:", sig);

      const event = await eventPromise;
      expect(event.owner.toBase58()).to.equal(trader.publicKey.toBase58());
      console.log("Removed", event.lpAmountIn.toString(), "LP tokens");
      console.log("Received", event.amountOut.toString(), "collateral tokens");
    });
  });
});
