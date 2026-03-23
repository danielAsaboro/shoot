import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import { createHash } from "crypto";
import { ADRENA_PROGRAM_ID, ADRENA_MAIN_POOL } from "../core/constants.js";
import type { TradeParams } from "../core/types.js";

function ixDisc(name: string): Buffer {
  return createHash("sha256").update(`global:${name}`).digest().subarray(0, 8);
}

/**
 * PerpBuilder constructs Adrena perpetual trading instructions.
 * Generates TransactionInstruction stubs for each trade direction.
 */
export class PerpBuilder {
  constructor(private owner: PublicKey) {}

  buildOpenLongIx(params: TradeParams): TransactionInstruction {
    return new TransactionInstruction({
      programId: ADRENA_PROGRAM_ID,
      keys: [
        { pubkey: this.owner, isSigner: true, isWritable: true },
        { pubkey: ADRENA_MAIN_POOL, isSigner: false, isWritable: true },
      ],
      data: Buffer.concat([
        ixDisc("open_or_increase_position_long"),
        Buffer.alloc(16),
      ]),
    });
  }

  buildOpenShortIx(params: TradeParams): TransactionInstruction {
    return new TransactionInstruction({
      programId: ADRENA_PROGRAM_ID,
      keys: [
        { pubkey: this.owner, isSigner: true, isWritable: true },
        { pubkey: ADRENA_MAIN_POOL, isSigner: false, isWritable: true },
      ],
      data: Buffer.concat([
        ixDisc("open_or_increase_position_short"),
        Buffer.alloc(16),
      ]),
    });
  }

  buildCloseLongIx(params: TradeParams): TransactionInstruction {
    return new TransactionInstruction({
      programId: ADRENA_PROGRAM_ID,
      keys: [
        { pubkey: this.owner, isSigner: true, isWritable: true },
        { pubkey: ADRENA_MAIN_POOL, isSigner: false, isWritable: true },
      ],
      data: Buffer.concat([ixDisc("close_position_long"), Buffer.alloc(16)]),
    });
  }

  buildCloseShortIx(params: TradeParams): TransactionInstruction {
    return new TransactionInstruction({
      programId: ADRENA_PROGRAM_ID,
      keys: [
        { pubkey: this.owner, isSigner: true, isWritable: true },
        { pubkey: ADRENA_MAIN_POOL, isSigner: false, isWritable: true },
      ],
      data: Buffer.concat([ixDisc("close_position_short"), Buffer.alloc(16)]),
    });
  }
}
