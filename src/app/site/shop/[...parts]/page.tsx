import type { Metadata } from "next";
import { ShopEntry, shopEntryMetadata } from "../../shop";

export const dynamic = "force-dynamic";

/** /shop/<category> or /shop/<product>. */
export async function generateMetadata({ params }: { params: Promise<{ parts: string[] }> }): Promise<Metadata> {
  const { parts } = await params;
  return shopEntryMetadata(parts);
}

export default async function Page({ params }: { params: Promise<{ parts: string[] }> }) {
  const { parts } = await params;
  return <ShopEntry parts={parts} />;
}
