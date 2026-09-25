import type { Metadata } from "next";
import { Plus_Jakarta_Sans, Space_Grotesk } from "next/font/google";
import type { ReactNode } from "react";

import { Providers } from "./providers";
import "./globals.css";

const display = Space_Grotesk({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-display",
});

const body = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-body",
});

export const metadata: Metadata = {
  title: "Trova — a safety rating for tokenized stocks",
  description:
    "The same stock exists on Solana as several tokens with very different rights. Trova rates what you'd actually own and whether you can get out — then lets you buy the soundest one and sell whenever you want.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${display.variable} ${body.variable}`}>
      {/* Font variables live on <html>: the body font resolves var(--font-body) at the root, and a
          variable defined only on <body> is invisible there — the whole app fell back to system-ui. */}
      <body className="antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
