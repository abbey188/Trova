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
  title: "Trova — know what you own",
  description:
    "Trova is a portfolio manager for tokenized stocks on Solana that rates every token on Ownership and Exit, so you hold the right one.",
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
