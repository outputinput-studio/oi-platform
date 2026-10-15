import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "output/input",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-AU">
      <body className="min-h-screen bg-[#111111] text-white antialiased">{children}</body>
    </html>
  );
}
