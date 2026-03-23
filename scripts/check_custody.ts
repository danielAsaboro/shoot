import { Connection, Keypair, PublicKey, VersionedTransaction } from "@solana/web3.js";
import { fetchOpenLong } from "../lib/adrena/client.ts";
import fs from "fs";
import path from "path";
import * as dotenv from "dotenv";

dotenv.config({ path: path.join(process.cwd(), ".env") });

const SURFPOOL = "http://localhost:8899";
const surfpool = new Connection(SURFPOOL, "confirmed");

// Load wallet from env
function loadWallet(): Keypair {
  const raw = process.env.AGENT_KEYPAIR;
  if (raw) {
    return Keypair.fromSecretKey(Buffer.from(JSON.parse(raw)));
  }
  throw new Error("AGENT_KEYPAIR not set");
}

async function main() {
  const wallet = loadWallet();
  console.log("Wallet:", wallet.publicKey.toBase58());
  
  // Check JITOSOL ATA exists
  const { TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } = await import("@solana/spl-token");
  const JITOSOL_MINT = new PublicKey("J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn");
  const [jitosolAta] = PublicKey.findProgramAddressSync(
    [wallet.publicKey.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), JITOSOL_MINT.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
  const ataInfo = await surfpool.getAccountInfo(jitosolAta);
  console.log("JITOSOL ATA exists on surfpool:", !!ataInfo);
  
  // Get Data API transaction
  const result = await fetchOpenLong({
    account: wallet.publicKey.toBase58(),
    collateralAmount: 0.5,
    collateralTokenSymbol: "USDC",
    tokenSymbol: "JITOSOL",
    leverage: 3,
  });
  
  const vtx = VersionedTransaction.deserialize(Buffer.from(result.transaction, "base64"));
  const { blockhash } = await surfpool.getLatestBlockhash("confirmed");
  vtx.message.recentBlockhash = blockhash;
  vtx.sign([wallet]);
  
  console.log("\nSending Data API transaction (skipPreflight=true)...");
  const sig = await surfpool.sendRawTransaction(vtx.serialize(), { skipPreflight: true });
  console.log("Sig:", sig);
  
  await new Promise(r => setTimeout(r, 3000));
  const status = await surfpool.getSignatureStatus(sig);
  console.log("Status:", JSON.stringify(status.value));
  
  if (status.value?.err) {
    // Get transaction logs
    const tx = await surfpool.getTransaction(sig, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
    console.log("Logs:", tx?.meta?.logMessages?.join("\n"));
  } else {
    console.log("SUCCESS!");
  }
}
main().catch(console.error);
