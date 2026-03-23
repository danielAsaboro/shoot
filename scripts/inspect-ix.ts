import "dotenv/config";
import { PublicKey, VersionedTransaction } from "@solana/web3.js";
import { fetchOpenLong } from "../lib/adrena/client.ts";

const ADRENA_PROGRAM_ID = new PublicKey("13gDzEXCdocbj8iAiqrScGo47NiSuYENGsRqi3SEAwet");

async function main() {
  const apiResult = await fetchOpenLong({ 
    account: "5MTGtCFmVRJjN76HwNrPuzFPfsrC3MuPoYxhAqvD9VwE", 
    collateralAmount: 0.5, collateralTokenSymbol: "USDC", tokenSymbol: "JITOSOL", leverage: 3 
  });
  const vtx = VersionedTransaction.deserialize(Buffer.from(apiResult.transaction, "base64"));
  const keys = vtx.message.staticAccountKeys;
  
  console.log("All keys in message:");
  keys.forEach((k, i) => console.log(`  [${i}] ${k.toBase58()}`));
  
  const aix = vtx.message.compiledInstructions.find(ix => keys[ix.programIdIndex].equals(ADRENA_PROGRAM_ID));
  if (!aix) throw new Error("No Adrena ix");
  
  console.log("\nAdrena instruction discriminator:", Buffer.from(aix.data.slice(0,8)).toString("hex"));
  console.log("Accounts used by Adrena ix:");
  aix.accountKeyIndexes.forEach((idx, i) => {
    const writable = vtx.message.isAccountWritable(idx);
    const signer = vtx.message.isAccountSigner(idx);
    console.log(`  [${i}] idx=${idx} ${writable?"W":" "}${signer?"S":" "} ${keys[idx].toBase58()}`);
  });
  
  // Also print all compiled instructions
  console.log("\nAll instructions:");
  vtx.message.compiledInstructions.forEach((ix, i) => {
    console.log(`  [${i}] program=${keys[ix.programIdIndex].toBase58().slice(0,20)} acct_count=${ix.accountKeyIndexes.length} data_len=${ix.data.length}`);
  });
}

main().catch(e => { console.error(e); process.exit(1); });
// Already there, replacing main to add ALT check
