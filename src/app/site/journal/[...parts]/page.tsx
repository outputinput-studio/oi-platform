import type { Metadata } from "next";
import { JournalEntry, journalEntryMetadata } from "../../article";

export const dynamic = "force-dynamic";

/** /journal/<category> or /journal/<article>, and /journal/<category>/<article>. */
export async function generateMetadata({ params }: { params: Promise<{ parts: string[] }> }): Promise<Metadata> {
  const { parts } = await params;
  return journalEntryMetadata(parts);
}

export default async function Page({ params }: { params: Promise<{ parts: string[] }> }) {
  const { parts } = await params;
  return <JournalEntry parts={parts} />;
}
