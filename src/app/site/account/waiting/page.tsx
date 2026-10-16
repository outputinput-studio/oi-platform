import type { Metadata } from "next";
import { WaitingPage, accountMetadata } from "../../account";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return accountMetadata("Waiting list");
}

export default function Waiting() {
  return <WaitingPage />;
}
