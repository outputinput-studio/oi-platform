import type { Metadata } from "next";
import { pageMetadata, Storefront } from "../storefront";

export const dynamic = "force-dynamic";

/**
 * Any address under the site that isn't the front page or the journal.
 * One segment is a page; anything else is checked against redirects and
 * otherwise logged as not found.
 */
export async function generateMetadata({ params }: { params: Promise<{ path: string[] }> }): Promise<Metadata> {
  const { path } = await params;
  return path.length === 1 ? pageMetadata(path[0]) : { title: "Not found", robots: { index: false, follow: false } };
}

export default async function SitePage({ params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  return <Storefront slug={path.length === 1 ? path[0] : null} requestPath={"/" + path.join("/")} />;
}
