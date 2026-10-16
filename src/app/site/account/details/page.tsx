import type { Metadata } from "next";
import { DetailsPage, accountMetadata } from "../../account";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return accountMetadata("Your details");
}

export default async function Details({ searchParams }: { searchParams: Promise<{ password?: string | string[] }> }) {
  return <DetailsPage passwordSaved={(await searchParams).password === "saved"} />;
}
