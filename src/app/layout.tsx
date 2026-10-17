import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";

/**
 * O/I's own icon, for the admin, ops and any storefront without a favicon
 * of its own. Kept in public/ (not app/favicon.ico) on purpose: a file
 * there is added to every page, where it would outrank a site's favicon.
 * A storefront page with its own favicon replaces these `icons` outright.
 */
export const metadata: Metadata = {
  title: "output/input",
  robots: { index: false, follow: false },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "48x48" },
      { url: "/brand/icon.svg", type: "image/svg+xml" },
    ],
    apple: [{ url: "/brand/apple-touch-icon.png" }],
  },
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
