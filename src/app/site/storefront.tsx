import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { siteFromHost } from "@/modules/sites/server";
import { HOME_SLUG, publishedPage } from "@/modules/pages/server";
import { RenderSections } from "@/modules/pages/render";
import { Placeholder } from "@/lib/placeholder";

/**
 * A storefront page: the site comes from the hostname, the page from the
 * path, and only published pages render. Stage 4a: a plain, readable
 * layout driven by tokens; themes dress it later.
 */
export async function Storefront({ slug }: { slug: string }) {
  const h = await headers();
  const host = h.get("x-oi-host") ?? h.get("host") ?? "";
  const site = await siteFromHost(host);
  if (!site) return <Placeholder surface="site" />; // no such site: keep the stage-1 placeholder

  const page = await publishedPage({ siteId: site.id, slug });
  if (!page) {
    if (slug === HOME_SLUG) return <ComingSoon name={site.name} />;
    notFound();
  }

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 md:px-8">
      <header className="mb-8 border-b border-[var(--border)] pb-4">
        <p className="text-sm text-[var(--muted)]">{site.name}</p>
      </header>
      <h1 className="sr-only">{page.title}</h1>
      <RenderSections sections={page.sections} />
    </main>
  );
}

/** A real site with nothing published yet. A page, not an error. */
function ComingSoon({ name }: { name: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center p-6" data-surface="site">
      <div className="text-center">
        <p className="text-2xl font-semibold">{name}</p>
        <p className="mt-2 text-[var(--muted)]">Something is on its way.</p>
      </div>
    </main>
  );
}
