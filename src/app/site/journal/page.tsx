import type { Metadata } from "next";
import { Journal, journalMetadata } from "../article";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return journalMetadata();
}

export default function JournalPage() {
  return <Journal />;
}
