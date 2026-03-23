"use client";

// Dynamic import of PrivyProvider with ssr:false — must live in a Client
// Component so Next.js allows the { ssr: false } option.
import dynamic from "next/dynamic";
import type { PropsWithChildren } from "react";

const PrivyProviders = dynamic(
  () => import("./providers").then((m) => ({ default: m.Providers })),
  { ssr: false, loading: () => null }
);

export function ClientProviders({ children }: PropsWithChildren) {
  return <PrivyProviders>{children}</PrivyProviders>;
}
