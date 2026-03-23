import { describe, it, expect } from "vitest";
import { Keypair, PublicKey } from "@solana/web3.js";
import { deriveAgentPda } from "../../src/onchain/shoot-program.js";
import { PerpBuilder } from "../../src/onchain/perp-builder.js";
import { ADRENA_PROGRAM_ID } from "../../src/core/constants.js";

describe("deriveAgentPda", () => {
  it("returns consistent PDA for same owner", () => {
    const owner = Keypair.generate().publicKey;
    const [pda1] = deriveAgentPda(owner);
    const [pda2] = deriveAgentPda(owner);
    expect(pda1.toBase58()).toBe(pda2.toBase58());
  });

  it("returns different PDAs for different owners", () => {
    const [pda1] = deriveAgentPda(Keypair.generate().publicKey);
    const [pda2] = deriveAgentPda(Keypair.generate().publicKey);
    expect(pda1.toBase58()).not.toBe(pda2.toBase58());
  });

  it("returns valid public key", () => {
    const [pda] = deriveAgentPda(Keypair.generate().publicKey);
    expect(pda).toBeInstanceOf(PublicKey);
  });
});

describe("PerpBuilder", () => {
  it("builds open long instruction", () => {
    const owner = Keypair.generate().publicKey;
    const builder = new PerpBuilder(owner);
    const ix = builder.buildOpenLongIx({
      market: "SOL",
      collateralAmount: 100,
      leverage: 5,
    });
    expect(ix.programId.toBase58()).toBe(ADRENA_PROGRAM_ID.toBase58());
    expect(ix.keys.length).toBeGreaterThan(0);
  });

  it("builds all four instruction types", () => {
    const owner = Keypair.generate().publicKey;
    const builder = new PerpBuilder(owner);
    const params = { market: "SOL", collateralAmount: 100, leverage: 5 };
    expect(builder.buildOpenLongIx(params).data.length).toBeGreaterThan(0);
    expect(builder.buildOpenShortIx(params).data.length).toBeGreaterThan(0);
    expect(builder.buildCloseLongIx(params).data.length).toBeGreaterThan(0);
    expect(builder.buildCloseShortIx(params).data.length).toBeGreaterThan(0);
  });

  it("owner is first signer in all instructions", () => {
    const owner = Keypair.generate().publicKey;
    const builder = new PerpBuilder(owner);
    const params = { market: "SOL", collateralAmount: 100, leverage: 5 };
    const ix = builder.buildOpenLongIx(params);
    expect(ix.keys[0].pubkey.toBase58()).toBe(owner.toBase58());
    expect(ix.keys[0].isSigner).toBe(true);
  });
});
