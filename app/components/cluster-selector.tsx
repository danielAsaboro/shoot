"use client";

import { useCluster, type SolanaCluster } from "./cluster-context";

const CLUSTER_OPTIONS: { id: SolanaCluster; label: string; color: string }[] = [
  { id: "localnet", label: "Localnet", color: "bg-yellow-400" },
  { id: "devnet", label: "Devnet", color: "bg-blue-400" },
  { id: "mainnet", label: "Mainnet", color: "bg-green-400" },
];

export function ClusterSelector() {
  const { cluster, setCluster } = useCluster();

  return (
    <div className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2 py-1">
      {CLUSTER_OPTIONS.map((opt) => (
        <button
          key={opt.id}
          onClick={() => setCluster(opt.id)}
          className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-all ${
            cluster === opt.id
              ? "bg-white/15 text-white"
              : "text-white/40 hover:text-white/70"
          }`}
        >
          <span
            className={`inline-block h-1.5 w-1.5 rounded-full ${
              cluster === opt.id ? opt.color : "bg-white/20"
            }`}
          />
          {opt.label}
        </button>
      ))}
    </div>
  );
}
