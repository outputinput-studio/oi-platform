import type { Metadata } from "next";
import { TrackPage, accountMetadata } from "../account";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return accountMetadata("Track my order");
}

export default function Track() {
  return <TrackPage />;
}
