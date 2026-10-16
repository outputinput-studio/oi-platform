import type { Metadata } from "next";
import { CheckoutPage } from "../../checkout";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Checkout", robots: { index: false, follow: false } };

export default function Page() {
  return <CheckoutPage />;
}
