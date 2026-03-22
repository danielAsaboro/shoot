/**
 * Solana Cluster Configuration
 *
 * Single source of truth for the active Solana cluster and RPC URL.
 * Server-side reads from NEXT_PUBLIC_SOLANA_CLUSTER env var.
 * Client-side can override via the ClusterContext (localStorage-backed).
 */

export type SolanaCluster = "localnet" | "devnet" | "mainnet";

const CLUSTER_RPC_MAP: Record<SolanaCluster, string> = {
  localnet: "http://127.0.0.1:8899",
  devnet: "https://api.devnet.solana.com",
  mainnet: "https://api.mainnet-beta.solana.com",
};

/**
 * Get the configured Solana cluster from the environment.
 * Defaults to "devnet" if not set.
 */
export function getCluster(): SolanaCluster {
  const env = process.env.NEXT_PUBLIC_SOLANA_CLUSTER;
  if (env === "localnet" || env === "devnet" || env === "mainnet") return env;
  return "devnet";
}

/**
 * Get the RPC URL for the active cluster.
 * Prefers NEXT_PUBLIC_SOLANA_RPC if set explicitly, otherwise derives from cluster.
 */
export function getRpcUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SOLANA_RPC;
  if (explicit) return explicit;
  return CLUSTER_RPC_MAP[getCluster()];
}

/**
 * Check if the active cluster is devnet (used for devnet-specific behavior
 * like fake USD-to-lamports conversion).
 */
export function isDevnet(): boolean {
  return getCluster() === "devnet" || getCluster() === "localnet";
}
