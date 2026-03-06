import type { Metadata } from "next";
import { Barlow_Condensed, Outfit, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { ClientProviders } from "./components/client-providers";

const barlowCondensed = Barlow_Condensed({
  subsets: ["latin"],
  weight: ["400", "600", "700", "800"],
  variable: "--font-barlow-condensed",
});

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
});

export const metadata: Metadata = {
  title: "ADRENA SHOOT",
  description:
    "Live competitive trading tournament on Adrena — prop challenges, World Cup brackets, and real-time leaderboards.",
  icons: {
    icon: "/icon.svg",
    shortcut: "/icon.svg",
    apple: "/icon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${barlowCondensed.variable} ${outfit.variable} ${jetbrainsMono.variable}`}
    >
      <body suppressHydrationWarning>
        <ClientProviders>{children}</ClientProviders>
      </body>
    </html>
  );
}
