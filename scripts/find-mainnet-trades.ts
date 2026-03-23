/**
 * Find successful Adrena trade transactions on mainnet.
 * Uses raw RPC calls with aggressive throttling to avoid rate limits.
 */
import "dotenv/config";
import { PublicKey } from "@solana/web3.js";

const ADRENA = new PublicKey("13gDzEXCdocbj8iAiqrScGo47NiSuYENGsRqi3SEAwet");
const POOL = new PublicKey("4bQRutgDJs6vuh6ZcWaPVXiQaBzbHketjbCDjL4oRN34");
const RPC = "https://api.mainnet-beta.solana.com";

const CUSTODIES: Record<string, PublicKey> = {
  USDC: new PublicKey("Dk523LZeDQbZtUwPEBjFXCd2Au1tD7mWZBJJmcgHktNk"),
  JITOSOL: new PublicKey("GZ9XfWwgTRhkma2Y91Q9r1XKotNXYjBnKKabj19rhT71"),
  BONK: new PublicKey("8aJuzsgjxBnvRhDcfQBD7z4CUj7QoPEpaNwVd7KqsSk5"),
  WBTC: new PublicKey("GFu3qS22mo6bAjg4Lr5R7L8pPgHq6GvbjJPKEHkbbs2c"),
};

const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function b58decode(s: string): Buffer {
  let n = BigInt(0);
  for (const c of s) n = n * 58n + BigInt(ALPHABET.indexOf(c));
  const hex = n.toString(16);
  const bytes = Buffer.from(hex.length % 2 ? "0" + hex : hex, "hex");
  let pad = 0;
  for (const c of s) { if (c === "1") pad++; else break; }
  return Buffer.concat([Buffer.alloc(pad), bytes]);
}

async function rpc(method: string, params: unknown[]): Promise<any> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch(RPC, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    });
    if (res.status === 429) {
      const delay = 2000 * (attempt + 1);
      console.log(`  Rate limited, waiting ${delay}ms...`);
      await new Promise((r) => setTimeout(r, delay));
      continue;
    }
    const json = await res.json() as any;
    return json.result;
  }
  throw new Error("Rate limited after 5 retries");
}

function tryDerivePda(owner: PublicKey, position: PublicKey): string | null {
  for (const [custName, custKey] of Object.entries(CUSTODIES)) {
    for (const side of [0, 1, 2]) {
      // With pool
      const [pda1] = PublicKey.findProgramAddressSync(
        [Buffer.from("position"), owner.toBuffer(), POOL.toBuffer(), custKey.toBuffer(), Buffer.from([side])],
        ADRENA
      );
      if (pda1.equals(position)) return `["position", owner, pool, ${custName}, side=${side}]`;

      // Without pool
      const [pda2] = PublicKey.findProgramAddressSync(
        [Buffer.from("position"), owner.toBuffer(), custKey.toBuffer(), Buffer.from([side])],
        ADRENA
      );
      if (pda2.equals(position)) return `["position", owner, ${custName}, side=${side}] (no pool)`;
    }
  }
  return null;
}

async function main() {
  console.log("Fetching recent Adrena program signatures...\n");

  const sigs = await rpc("getSignaturesForAddress", [ADRENA.toBase58(), { limit: 200 }]);
  console.log(`Got ${sigs.length} signatures`);

  // First pass: count non-error sigs
  const goodSigs = sigs.filter((s: any) => !s.err);
  console.log(`Non-error: ${goodSigs.length}`);

  let tradesFound = 0;
  let checked = 0;

  for (const sigInfo of goodSigs) {
    if (tradesFound >= 5) break;
    checked++;

    // Throttle
    await new Promise((r) => setTimeout(r, 1500));

    const txData = await rpc("getTransaction", [
      sigInfo.signature,
      { encoding: "json", maxSupportedTransactionVersion: 0 },
    ]);
    if (!txData) continue;

    const logs: string[] = txData.meta?.logMessages ?? [];
    const tradeKeywords = [
      "OpenPositionLong", "OpenPositionShort",
      "OpenOrIncreasePositionWithSwapLong", "OpenOrIncreasePositionWithSwapShort",
      "ClosePositionLong", "ClosePositionShort",
    ];

    const isTrade = logs.some((l: string) => tradeKeywords.some((kw) => l.includes(kw)));
    if (!isTrade) {
      if (checked % 10 === 0) console.log(`  Checked ${checked}/${goodSigs.length} (${tradesFound} trades found)...`);
      continue;
    }

    const hasError = logs.some((l: string) => l.includes("AnchorError") || l.includes("Error Number:"));

    tradesFound++;
    console.log(`\n${"=".repeat(70)}`);
    console.log(`TRADE #${tradesFound}: ${sigInfo.signature}`);
    console.log(`Status: ${hasError ? "FAILED" : "SUCCESS"}`);
    console.log(`${"=".repeat(70)}`);

    for (const log of logs) {
      if (log.includes("Instruction:") || log.includes("Error") || log.includes("consumed"))
        console.log("  LOG:", log);
    }

    // Get account keys
    const msg = txData.transaction.message;
    const accountKeys: string[] = msg.accountKeys;
    const loaded = txData.meta?.loadedAddresses;
    const allKeys: string[] = [...accountKeys];
    if (loaded) {
      allKeys.push(...(loaded.writable || []));
      allKeys.push(...(loaded.readonly || []));
    }

    // Find Adrena instructions
    for (const ix of msg.instructions) {
      const progKey = accountKeys[ix.programIdIndex];
      if (!progKey?.startsWith("13gDz")) continue;

      const accounts: number[] = ix.accounts;
      const data = b58decode(ix.data);

      console.log(`\n  Adrena IX: ${accounts.length} accounts, ${data.length}B data`);
      console.log(`  Discriminator: ${data.subarray(0, 8).toString("hex")}`);

      // Print all instruction accounts
      for (let i = 0; i < accounts.length; i++) {
        const key = allKeys[accounts[i]] ?? `IDX_${accounts[i]}`;
        console.log(`    [${i.toString().padStart(2)}] ${key}`);
      }

      // The signer/owner is typically accounts[0]
      const ownerStr = allKeys[accounts[0]];
      if (!ownerStr) continue;
      const owner = new PublicKey(ownerStr);

      // Try to find position PDA match at various indexes
      console.log(`\n  Owner: ${ownerStr}`);
      console.log("  PDA derivation check:");

      for (let i = 0; i < accounts.length; i++) {
        const keyStr = allKeys[accounts[i]];
        if (!keyStr) continue;
        const key = new PublicKey(keyStr);

        const match = tryDerivePda(owner, key);
        if (match) {
          console.log(`    *** MATCH at ix[${i}]: ${match} ***`);
        }
      }
    }

    // Also check inner instructions for CPI
    const innerIxs = txData.meta?.innerInstructions ?? [];
    for (const inner of innerIxs) {
      for (const ix of inner.instructions) {
        const progKey = allKeys[ix.programIdIndex];
        if (!progKey?.startsWith("13gDz")) continue;

        const accounts: number[] = ix.accounts;
        const data = b58decode(ix.data);

        console.log(`\n  INNER Adrena IX (from ix#${inner.index}): ${accounts.length} accounts, ${data.length}B data`);
        console.log(`  Discriminator: ${data.subarray(0, 8).toString("hex")}`);

        for (let i = 0; i < accounts.length; i++) {
          const key = allKeys[accounts[i]] ?? `IDX_${accounts[i]}`;
          console.log(`    [${i.toString().padStart(2)}] ${key}`);
        }

        // Try PDA at the first signer/owner
        const ownerStr = allKeys[accounts[0]];
        if (!ownerStr) continue;
        const owner = new PublicKey(ownerStr);
        for (let i = 0; i < accounts.length; i++) {
          const keyStr = allKeys[accounts[i]];
          if (!keyStr) continue;
          const key = new PublicKey(keyStr);
          const match = tryDerivePda(owner, key);
          if (match) {
            console.log(`    *** INNER MATCH at ix[${i}]: ${match} ***`);
          }
        }
      }
    }
  }

  console.log(`\n\nDone. Checked ${checked} transactions, found ${tradesFound} trades.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
