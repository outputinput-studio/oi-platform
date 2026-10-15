import { Storefront } from "../storefront";

export const dynamic = "force-dynamic";

export default async function SitePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <Storefront slug={slug} />;
}
