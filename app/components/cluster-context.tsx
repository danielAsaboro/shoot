"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  type PropsWithChildren,
} from "react";

export type SolanaCluster = "localnet" | "devnet" | "mainnet";

const CLUSTER_RPC_MAP: Record<SolanaCluster, string> = {
  localnet: "http://127.0.0.1:8899",
  devnet: "https://api.devnet.solana.com",
  mainnet: "https://api.mainnet-beta.solana.com",
};

interface ClusterContextValue {
  cluster: SolanaCluster;
  rpcUrl: string;
  setCluster: (cluster: SolanaCluster) => void;
}

const ClusterContext = createContext<ClusterContextValue>({
  cluster: "devnet",
  rpcUrl: CLUSTER_RPC_MAP.devnet,
  setCluster: () => {},
});

const STORAGE_KEY = "shoot-solana-cluster";

function getInitialCluster(): SolanaCluster {
  // Check localStorage first (client override)
  if (typeof window !== "undefined") {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "localnet" || stored === "devnet" || stored === "mainnet") {
      return stored;
    }
  }
  // Fall back to env var
  const env = process.env.NEXT_PUBLIC_SOLANA_CLUSTER;
  if (env === "localnet" || env === "devnet" || env === "mainnet") return env;
  return "devnet";
}

export function ClusterProvider({ children }: PropsWithChildren) {
  const [cluster, setClusterState] = useState<SolanaCluster>(getInitialCluster);

  const setCluster = useCallback((c: SolanaCluster) => {
    setClusterState(c);
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, c);
    }
  }, []);

  const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC ?? CLUSTER_RPC_MAP[cluster];

  return (
    <ClusterContext.Provider value={{ cluster, rpcUrl, setCluster }}>
      {children}
    </ClusterContext.Provider>
  );
}

export function useCluster() {
  return useContext(ClusterContext);
}
