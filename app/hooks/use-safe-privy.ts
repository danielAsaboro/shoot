"use client";

/**
 * Safe wrappers around Privy hooks that return fallback/noop values when
 * NEXT_PUBLIC_PRIVY_APP_ID is not configured. This lets the app render
 * without Privy API keys.
 *
 * The PRIVY_CONFIGURED flag is a build-time constant (NEXT_PUBLIC_ env vars
 * are inlined by Next.js), so the branch is always the same — no conditional
 * hook violation at runtime.
 */

import { usePrivy as _usePrivy } from "@privy-io/react-auth";
import {
  useWallets as _useWallets,
  useSignAndSendTransaction as _useSignAndSendTransaction,
} from "@privy-io/react-auth/solana";

const PRIVY_CONFIGURED = !!process.env.NEXT_PUBLIC_PRIVY_APP_ID;

// ---------- usePrivy wrapper ----------

const fallbackPrivy = {
  ready: true,
  authenticated: false,
  login: () => {},
  logout: async () => {},
  user: null,
} as unknown as ReturnType<typeof _usePrivy>;

export function useSafePrivy(): ReturnType<typeof _usePrivy> {
  if (PRIVY_CONFIGURED) {
    return _usePrivy();
  }
  return fallbackPrivy;
}

// ---------- useWallets wrapper ----------

const fallbackWallets = { wallets: [] } as unknown as ReturnType<
  typeof _useWallets
>;

export function useSafeWallets(): ReturnType<typeof _useWallets> {
  if (PRIVY_CONFIGURED) {
    return _useWallets();
  }
  return fallbackWallets;
}

// ---------- useSignAndSendTransaction wrapper ----------

const fallbackSignAndSend = {
  signAndSendTransaction: async () => ({ hash: "fallback-tx-hash" }),
} as unknown as ReturnType<typeof _useSignAndSendTransaction>;

export function useSafeSignAndSendTransaction(): ReturnType<
  typeof _useSignAndSendTransaction
> {
  if (PRIVY_CONFIGURED) {
    return _useSignAndSendTransaction();
  }
  return fallbackSignAndSend;
}
