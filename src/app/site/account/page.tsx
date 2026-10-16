import type { Metadata } from "next";
import { AccountPage, accountMetadata } from "../account";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return accountMetadata("Your account");
}

export default async function Account({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  const { next } = await searchParams;
  return <AccountPage next={typeof next === "string" ? next : undefined} />;
}
