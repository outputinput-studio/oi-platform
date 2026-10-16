import type { Metadata } from "next";
import { Shop, shopMetadata } from "../shop";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return shopMetadata();
}

export default function ShopPage() {
  return <Shop />;
}
