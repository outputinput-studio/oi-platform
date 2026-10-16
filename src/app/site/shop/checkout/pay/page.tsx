import type { Metadata } from "next";
import { TestPayPage } from "../../../checkout";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Test payment", robots: { index: false, follow: false } };

export default async function Page({ searchParams }: { searchParams: Promise<{ order?: string }> }) {
  const { order } = await searchParams;
  return <TestPayPage orderId={order ?? ""} />;
}
