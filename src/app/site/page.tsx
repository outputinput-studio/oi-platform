import type { Metadata } from "next";
import { Storefront } from "./storefront";
import { pageMetadata } from "./storefront";
import { HOME_SLUG } from "@/modules/pages/server";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata(HOME_SLUG);
}

export default function Home() {
  return <Storefront slug={HOME_SLUG} />;
}
