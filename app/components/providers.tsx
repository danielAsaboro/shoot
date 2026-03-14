"use client";

import { PrivyProvider } from "@privy-io/react-auth";
import { toSolanaWalletConnectors } from "@privy-io/react-auth/solana";
import type { PropsWithChildren } from "react";
import { ClusterProvider } from "./cluster-context";

const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? "";
const solanaConnectors = toSolanaWalletConnectors({ shouldAutoConnect: true });

/**
 * When NEXT_PUBLIC_PRIVY_APP_ID is not set, skip the PrivyProvider entirely
 * so the app works with unconfigured Privy — auth disabled.
 */
export function Providers({ children }: PropsWithChildren) {
  if (!PRIVY_APP_ID) {
    return <ClusterProvider>{children}</ClusterProvider>;
  }

  return (
    <ClusterProvider>
      <PrivyProvider
        appId={PRIVY_APP_ID}
        config={{
          appearance: {
            theme: "dark",
            accentColor: "#00F0FF",
            landingHeader: "Connect to Adrena",
            loginMessage: "Sign in to access the Prop Challenge Hub",
          },
          loginMethods: ["email", "wallet", "google", "twitter"],
          embeddedWallets: {
            solana: { createOnLogin: "users-without-wallets" },
          },
          externalWallets: { solana: { connectors: solanaConnectors } },
        }}
      >
        {children}
      </PrivyProvider>
    </ClusterProvider>
  );
}
