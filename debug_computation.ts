
import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { getComputationAccAddress } from "@arcium-hq/client";
import { BN } from "bn.js";

async function main() {
  const programId = new PublicKey("Bv3Fb9VjzjWGfX18QTUcVycAfeLoQ5zZN6vv2g3cTZxp");
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  // Fetch recent signatures for the program
  console.log("Fetching recent signatures for program:", programId.toBase58());
  try {
    const signatures = await provider.connection.getSignaturesForAddress(programId, { limit: 5 }, "confirmed");
    for (const sigInfo of signatures) {
      console.log(`\nSignature: ${sigInfo.signature}`);
      console.log(`Slot: ${sigInfo.slot}`);
      console.log(`Err: ${sigInfo.err}`);
      console.log(`BlockTime: ${sigInfo.blockTime}`);
      
      // Fetch transaction details
      const tx = await provider.connection.getTransaction(sigInfo.signature, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
      if (tx) {
        console.log("Logs:");
        tx.meta?.logMessages?.forEach(log => console.log(`  ${log}`));
      }
    }
  } catch (e) {
    console.error("Error fetching signatures:", e);
  }

  const offsets = [
    "178109615966649338",
    "11242474780917027414"
  ];
  // ... existing code ...

  for (const offsetStr of offsets) {
    const offset = new BN(offsetStr);
    const address = getComputationAccAddress(programId, offset);
    console.log(`\nOffset: ${offsetStr}`);
    console.log(`Address: ${address.toBase58()}`);

    try {
      const info = await provider.connection.getAccountInfo(address);
      if (info) {
        console.log("Account exists!");
        console.log("Data length:", info.data.length);
        console.log("First 32 bytes:", info.data.slice(0, 32).toString("hex"));
      } else {
        console.log("Account NOT found.");
      }
    } catch (e) {
      console.error("Error fetching account:", e);
    }
  }
}

main().catch(console.error);

