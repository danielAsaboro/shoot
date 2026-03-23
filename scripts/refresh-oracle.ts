/**
 * Refresh Adrena oracle account on Surfpool by cloning from mainnet.
 * Fixes MissingOraclePrice errors caused by stale forked oracle data.
 */
import "dotenv/config";
import { Connection, PublicKey } from "@solana/web3.js";

const SURFPOOL_URL = process.env.SURFPOOL_URL ?? "http://localhost:8899";
const MAINNET_URL = "https://api.mainnet-beta.solana.com";
const ADRENA_ORACLE = new PublicKey("GEm9TZP7BL8rTz1JDy6X74PL595zr1putA9BXC8ehDmU");

let rpcId = 0;
async function surfnetRpc(method: string, params?: unknown[]): Promise<unknown> {
  const body: Record<string, unknown> = { jsonrpc: "2.0", id: ++rpcId, method };
  if (params) body.params = params;
  const res = await fetch(SURFPOOL_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = (await res.json()) as { result?: unknown; error?: { message: string } };
  if (json.error) throw new Error(`RPC ${method}: ${json.error.message}`);
  return json.result;
}

const SYSVAR_CLOCK = new PublicKey("SysvarC1ock11111111111111111111111111111111");
const ORACLE_PRICES_START = 24;
const ORACLE_ENTRY_SIZE = 64;

async function getSurfpoolUnixTimestamp(): Promise<bigint> {
  const surfpool = new Connection(SURFPOOL_URL, "confirmed");
  const info = await surfpool.getAccountInfo(SYSVAR_CLOCK);
  if (!info) throw new Error("Clock sysvar missing on Surfpool");
  return Buffer.from(info.data).readBigInt64LE(32);
}

function patchOracleTimestamps(data: Buffer, unixTimestamp: bigint): number {
  data.writeBigInt64LE(unixTimestamp, 16);
  let patched = 0;
  for (let i = 0; i < 20; i++) {
    const base = ORACLE_PRICES_START + i * ORACLE_ENTRY_SIZE;
    if (base + ORACLE_ENTRY_SIZE > data.length) break;
    const nameLen = data[base + 32 + 31];
    if (nameLen === 0 || nameLen > 31) continue;
    const name = data.subarray(base + 32, base + 32 + nameLen).toString("ascii");
    if (name === "USDCUSD" && data.readBigUInt64LE(base) === 0n) {
      data.writeBigUInt64LE(10_000_000_000n, base);
      data.writeBigUInt64LE(0n, base + 8);
      data.writeInt32LE(-10, base + 24);
    }
    data.writeBigInt64LE(unixTimestamp, base + 16);
    patched++;
  }
  return patched;
}

async function main() {
  const mainnet = new Connection(MAINNET_URL, "confirmed");
  const [info, surfpoolTime] = await Promise.all([
    mainnet.getAccountInfo(ADRENA_ORACLE),
    getSurfpoolUnixTimestamp(),
  ]);
  if (!info) throw new Error("Oracle not found on mainnet");

  const data = Buffer.from(info.data);
  const patched = patchOracleTimestamps(data, surfpoolTime);

  await surfnetRpc("surfnet_setAccount", [ADRENA_ORACLE.toBase58(), {
    lamports: info.lamports,
    data: data.toString("hex"),
    owner: info.owner.toBase58(),
  }]);
  console.log(`✓ Oracle refreshed from mainnet (${info.data.length} bytes, ${patched} timestamps patched)`);
}

main().catch(e => { console.error(e); process.exit(1); });
