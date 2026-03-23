import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
} from "@solana/web3.js";
import { createHash } from "crypto";
import { SHOOT_PROGRAM_ID } from "../core/constants.js";

function ixDiscriminator(name: string): Buffer {
  return createHash("sha256").update(`global:${name}`).digest().subarray(0, 8);
}

export function deriveAgentPda(owner: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("agent"), owner.toBuffer(), owner.toBuffer().subarray(0, 8)],
    SHOOT_PROGRAM_ID
  );
}

export class ShootProgram {
  constructor(
    private connection: Connection,
    private payer: Keypair
  ) {}

  async buildRegisterAgentIx(
    name: string,
    strategyHash: Uint8Array
  ): Promise<TransactionInstruction> {
    if (strategyHash.length !== 32)
      throw new Error("strategyHash must be 32 bytes");

    const [agent] = deriveAgentPda(this.payer.publicKey);
    const disc = ixDiscriminator("register_agent");

    const truncatedName = name.slice(0, 32);
    const nameLen = Buffer.alloc(4);
    nameLen.writeUInt32LE(truncatedName.length, 0);

    const data = Buffer.concat([
      disc,
      nameLen,
      Buffer.from(truncatedName, "utf-8"),
      Buffer.from(strategyHash),
    ]);

    return new TransactionInstruction({
      programId: SHOOT_PROGRAM_ID,
      keys: [
        { pubkey: this.payer.publicKey, isSigner: true, isWritable: true },
        { pubkey: agent, isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data,
    });
  }
}
