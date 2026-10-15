import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";

export const metadata: Metadata = {
  title: "output/input",
  robots: { index: false, follow: false },
};

/** Geist for words, Geist Mono for labels, addresses and numbers — as the design has it. */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-AU" className={`${GeistSans.variable} ${GeistMono.variable}`} suppressHydrationWarning>
      <head>
        {/* The folded-sidebar choice is per device; set it before paint so nothing jumps. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{if(localStorage.getItem("oi:sidebar")==="collapsed")document.documentElement.dataset.sidebar="collapsed"}catch(e){}`,
          }}
        />
      </head>
      <body className="min-h-screen bg-bg font-sans text-text antialiased">{children}</body>
    </html>
  );
}
