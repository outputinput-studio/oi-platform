import type { Metadata } from "next";
import { AddressesPage, accountMetadata } from "../../account";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return accountMetadata("Your addresses");
}

export default function Addresses() {
  return <AddressesPage />;
}
