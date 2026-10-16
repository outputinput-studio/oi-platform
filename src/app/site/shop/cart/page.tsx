import type { Metadata } from "next";
import { CartPage } from "../../checkout";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your cart", robots: { index: false, follow: false } };

export default function Page() {
  return <CartPage />;
}
