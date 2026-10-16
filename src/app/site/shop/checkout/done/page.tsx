import type { Metadata } from "next";
import { DonePage } from "../../../checkout";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Thank you", robots: { index: false, follow: false } };

export default async function Page({ searchParams }: { searchParams: Promise<{ order?: string; session?: string }> }) {
  const { order, session } = await searchParams;
  return <DonePage orderId={order ?? ""} sessionId={session} />;
}
