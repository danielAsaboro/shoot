// Disable static prerender — Privy and Solana wallet hooks need a live client
export const dynamic = "force-dynamic";

import { ArenaHub } from "./components/arena-hub";

export default function Home() {
  return <ArenaHub />;
}
