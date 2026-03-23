import { Connection, PublicKey } from "@solana/web3.js";

const DEFAULT_RPC_URL = "http://localhost:8899";

export interface SurfpoolClient {
  connection: Connection;
  rpcUrl: string;

  /** Advance the network clock by the given number of seconds */
  timeTravel(seconds: number): Promise<void>;
  /** Halt block production */
  pauseClock(): Promise<void>;
  /** Resume block production */
  resumeClock(): Promise<void>;
  /** Set account properties (lamports, data, owner, executable) */
  setAccount(
    pubkey: PublicKey,
    opts: {
      lamports?: number;
      data?: Buffer;
      owner?: PublicKey;
      executable?: boolean;
    }
  ): Promise<void>;
  /** Set a token account's balance, delegate, and state */
  setTokenAccount(
    owner: PublicKey,
    mint: PublicKey,
    opts: {
      amount: bigint;
      delegate?: PublicKey;
      delegatedAmount?: number;
      state?: string;
      closeAuthority?: PublicKey;
    }
  ): Promise<void>;
  /** Reset the entire Surfnet network to its initial state */
  resetNetwork(): Promise<void>;
  /** Deploy a program via surfnet_writeProgram (hex-encoded chunks) */
  writeProgram(programId: PublicKey, elfBytes: Buffer): Promise<void>;
  /** Create a raw SPL Token account at a specific address with given balance */
  createRawTokenAccount(
    address: PublicKey,
    mint: PublicKey,
    owner: PublicKey,
    amount: bigint
  ): Promise<void>;
}

async function surfnetRpc(
  rpcUrl: string,
  method: string,
  params: unknown[] = []
): Promise<unknown> {
  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method,
      params,
    }),
  });

  const json = (await res.json()) as {
    result?: unknown;
    error?: { code: number; message: string };
  };
  if (json.error) {
    throw new Error(`Surfnet RPC error (${method}): ${json.error.message}`);
  }
  return json.result;
}

export function createSurfpoolClient(
  rpcUrl: string = DEFAULT_RPC_URL
): SurfpoolClient {
  const connection = new Connection(rpcUrl, "confirmed");

  return {
    connection,
    rpcUrl,

    async timeTravel(seconds: number): Promise<void> {
      // Convert seconds to approximate slot offset (400ms per slot)
      const slotsToAdvance = Math.ceil((seconds * 1000) / 400);
      const epochInfo = (await surfnetRpc(rpcUrl, "getEpochInfo")) as {
        absoluteSlot: number;
      };
      const targetSlot = epochInfo.absoluteSlot + slotsToAdvance;
      await surfnetRpc(rpcUrl, "surfnet_timeTravel", [
        { absoluteSlot: targetSlot },
      ]);
    },

    async pauseClock(): Promise<void> {
      await surfnetRpc(rpcUrl, "surfnet_pauseClock");
    },

    async resumeClock(): Promise<void> {
      await surfnetRpc(rpcUrl, "surfnet_resumeClock");
    },

    async setAccount(pubkey, opts): Promise<void> {
      const params: Record<string, unknown> = {};
      if (opts.lamports !== undefined) params.lamports = opts.lamports;
      if (opts.data !== undefined)
        params.data = opts.data.toString("hex");
      if (opts.owner !== undefined) params.owner = opts.owner.toBase58();
      if (opts.executable !== undefined) params.executable = opts.executable;
      await surfnetRpc(rpcUrl, "surfnet_setAccount", [
        pubkey.toBase58(),
        params,
      ]);
    },

    async setTokenAccount(owner, mint, opts): Promise<void> {
      // surfnet_setTokenAccount params: [owner, mint, update, tokenProgram?]
      const update: Record<string, unknown> = {
        amount: Number(opts.amount),
      };
      if (opts.delegate) update.delegate = opts.delegate.toBase58();
      if (opts.delegatedAmount !== undefined)
        update.delegatedAmount = opts.delegatedAmount;
      if (opts.state) update.state = opts.state;
      if (opts.closeAuthority)
        update.closeAuthority = opts.closeAuthority.toBase58();

      await surfnetRpc(rpcUrl, "surfnet_setTokenAccount", [
        owner.toBase58(),
        mint.toBase58(),
        update,
      ]);
    },

    async createRawTokenAccount(address, mint, owner, amount): Promise<void> {
      // SPL Token Account layout: 165 bytes
      const data = Buffer.alloc(165);
      mint.toBuffer().copy(data, 0); // mint (32 bytes)
      owner.toBuffer().copy(data, 32); // owner (32 bytes)
      data.writeBigUInt64LE(amount, 64); // amount (8 bytes)
      // delegate option: None (4 bytes = 0 at offset 72)
      data.writeUInt8(1, 108); // state: Initialized = 1
      // is_native option: None (4+8 bytes at offset 109)
      // delegated_amount: 0 (8 bytes at offset 121)
      // close_authority option: None (4 bytes at offset 129)
      // remaining bytes are 0

      const TOKEN_PROGRAM = new PublicKey(
        "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
      );
      await surfnetRpc(rpcUrl, "surfnet_setAccount", [
        address.toBase58(),
        {
          data: data.toString("hex"),
          lamports: 2_039_280, // rent-exempt minimum for token accounts
          owner: TOKEN_PROGRAM.toBase58(),
        },
      ]);
    },

    async resetNetwork(): Promise<void> {
      await surfnetRpc(rpcUrl, "surfnet_resetNetwork");
    },

    async writeProgram(programId, elfBytes): Promise<void> {
      // surfnet_writeProgram expects hex-encoded data chunks
      const chunkSize = 512 * 1024; // 512KB chunks
      for (let offset = 0; offset < elfBytes.length; offset += chunkSize) {
        const chunk = elfBytes.subarray(offset, offset + chunkSize);
        await surfnetRpc(rpcUrl, "surfnet_writeProgram", [
          programId.toBase58(),
          chunk.toString("hex"),
          offset,
        ]);
      }
    },
  };
}
