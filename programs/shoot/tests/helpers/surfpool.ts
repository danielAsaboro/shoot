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
  /** Reset the entire Surfnet network to its initial state */
  resetNetwork(): Promise<void>;
  /** Deploy a program in chunks */
  writeProgram(programId: PublicKey, elfBytes: Buffer): Promise<void>;
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
      await surfnetRpc(rpcUrl, "surfnet_timeTravel", [{ seconds }]);
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
        params.data = opts.data.toString("base64");
      if (opts.owner !== undefined) params.owner = opts.owner.toBase58();
      if (opts.executable !== undefined) params.executable = opts.executable;
      await surfnetRpc(rpcUrl, "surfnet_setAccount", [
        pubkey.toBase58(),
        params,
      ]);
    },

    async resetNetwork(): Promise<void> {
      await surfnetRpc(rpcUrl, "surfnet_resetNetwork");
    },

    async writeProgram(programId, elfBytes): Promise<void> {
      // Surfnet writeProgram accepts base64-encoded chunks
      const chunkSize = 512 * 1024; // 512KB chunks
      for (let offset = 0; offset < elfBytes.length; offset += chunkSize) {
        const chunk = elfBytes.subarray(offset, offset + chunkSize);
        await surfnetRpc(rpcUrl, "surfnet_writeProgram", [
          programId.toBase58(),
          chunk.toString("base64"),
          offset,
        ]);
      }
    },
  };
}
