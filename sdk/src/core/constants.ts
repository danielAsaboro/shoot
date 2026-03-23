import { PublicKey } from "@solana/web3.js";

export const SHOOT_PROGRAM_ID = new PublicKey(
  "4HVnwG8iz7wdUbEQDH8cYGD6EuxNmMuEbvCrz8Ke2iMG"
);
export const ADRENA_PROGRAM_ID = new PublicKey(
  "13gDzEXCdocbj8iAiqrScGo47NiSuYENGsRqi3SEAwet"
);
export const ADRENA_MAIN_POOL = new PublicKey(
  "5RhLNXTgVKii4azJSHVmGQYeEp2TbaE7Gw5W7Tq1DWor"
);

export const PYTH_FEED_IDS: Record<string, string> = {
  SOL: "0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d",
  BTC: "0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43",
  ETH: "0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace",
  BONK: "0x72b021217ca3fe68922a19aaf990109cb9d84e9ad004b4d2025ad6f529314419",
  JITOSOL: "0x67be9f519b95cf24338801051f9a808eff0a578ccb388db73b7f6fe1de019ffb",
};
