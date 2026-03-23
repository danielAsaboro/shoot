import "dotenv/config";
import { PublicKey, VersionedTransaction, Connection } from "@solana/web3.js";
import { fetchOpenLong } from "../lib/adrena/client.ts";

const ADRENA_PROGRAM_ID = new PublicKey("13gDzEXCdocbj8iAiqrScGo47NiSuYENGsRqi3SEAwet");
const MAINNET_URL = "https://api.mainnet-beta.solana.com";

async function main() {
  const apiResult = await fetchOpenLong({ 
    account: "5MTGtCFmVRJjN76HwNrPuzFPfsrC3MuPoYxhAqvD9VwE", 
    collateralAmount: 0.5, collateralTokenSymbol: "USDC", tokenSymbol: "JITOSOL", leverage: 3 
  });
  const vtx = VersionedTransaction.deserialize(Buffer.from(apiResult.transaction, "base64"));
  
  console.log("Address table lookups:", vtx.message.addressTableLookups.length);
  for (const alt of vtx.message.addressTableLookups) {
    console.log("  ALT:", alt.accountKey.toBase58());
    console.log("  writable indexes:", alt.writableIndexes);
    console.log("  readonly indexes:", alt.readonlyIndexes);
    
    // Fetch ALT account
    const conn = new Connection(MAINNET_URL, "confirmed");
    const info = await conn.getAccountInfo(alt.accountKey);
    if (info) {
      console.log("  ALT data len:", info.data.length);
    }
  }
  
  // Check if the Adrena oracle is actually read-only in the original message
  const keys = vtx.message.staticAccountKeys;
  console.log("\nAccount writability for oracle (idx 9):", vtx.message.isAccountWritable(9));
  console.log("Account writability check for each account:");
  for (let i = 0; i < keys.length; i++) {
    console.log(`  [${i}] writable=${vtx.message.isAccountWritable(i)} signer=${vtx.message.isAccountSigner(i)} ${keys[i].toBase58().slice(0,20)}`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
