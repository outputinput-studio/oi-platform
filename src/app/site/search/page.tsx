import type { Metadata } from "next";
import { SearchPage, searchMetadata } from "../search";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ q?: string | string[] }> };
const query = async (p: Props) => {
  const { q } = await p.searchParams;
  return typeof q === "string" ? q : "";
};

export async function generateMetadata(props: Props): Promise<Metadata> {
  return searchMetadata(await query(props));
}

export default async function Search(props: Props) {
  return <SearchPage q={await query(props)} />;
}
