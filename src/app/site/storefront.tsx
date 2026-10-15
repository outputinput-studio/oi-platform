import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { siteFromHost, siteTheme } from "@/modules/sites/server";
import { themeVars } from "@/modules/sites/theme";
import { HOME_SLUG, publishedPage, publishedPages } from "@/modules/pages/server";
import { hasPublishedArticles } from "@/modules/articles/server";
import { RenderSections } from "@/modules/pages/render";
import { Placeholder } from "@/lib/placeholder";
import type { Site } from "@/db/schema";

/**
 * A storefront page: the site comes from the hostname, the page from the
 * path, and only published pages render. The look is the site's theme
 * (dark or light, its own accent), applied as CSS variables on the frame,
 * so every section below reads tokens and never a colour.
 */
export async function Storefront({ slug }: { slug: string }) {
  const h = await headers();
  const host = h.get("x-oi-host") ?? h.get("host") ?? "";
  const site = await siteFromHost(host);
  if (!site) return <Placeholder surface="site" />; // no such site: keep the stage-1 placeholder

  const [page, menu] = await Promise.all([publishedPage({ siteId: site.id, slug }), storefrontMenu(site.id)]);
  if (!page) {
    if (slug === HOME_SLUG) return <ComingSoon site={site} />;
    notFound();
  }

  return (
    <Frame site={site} menu={menu} current={slug}>
      <h1 className="sr-only">{page.title}</h1>
      <RenderSections sections={page.sections} />
    </Frame>
  );
}

/** The menu: every live page, then Journal when there's an article to read. */
export async function storefrontMenu(siteId: string): Promise<{ slug: string; title: string }[]> {
  const [pages, journal] = await Promise.all([publishedPages({ siteId }), hasPublishedArticles({ siteId })]);
  return [...pages.map((p) => ({ slug: p.slug, title: p.title })), ...(journal ? [{ slug: "journal", title: "Journal" }] : [])];
}

/**
 * The frame every storefront page sits in: theme, header with the menu,
 * footer. The editor's preview renders the same frame (`preview`): links
 * become plain text there, so nothing inside the preview pane navigates.
 */
export function Frame({
  site,
  menu,
  current,
  preview = false,
  children,
}: {
  site: Site;
  menu: { slug: string; title: string }[];
  current: string;
  preview?: boolean;
  children: React.ReactNode;
}) {
  const theme = siteTheme(site);
  const links = menu.filter((p) => p.slug !== HOME_SLUG);
  const A = preview ? PreviewLink : Link;
  return (
    <div data-surface="site" data-theme={theme.mode} style={themeVars(theme) as React.CSSProperties} className="flex min-h-screen flex-col bg-[var(--bg)] text-[var(--text)]">
      <header className="border-b border-[var(--border)]">
        <div className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between gap-6 px-5 md:px-8">
          <A href="/" className="text-[17px] font-semibold tracking-[-0.2px]">
            {site.name}
          </A>
          {links.length > 0 && (
            <nav aria-label="Pages" className="flex gap-5 overflow-x-auto text-[14px]">
              {links.map((p) => (
                <A key={p.slug} href={`/${p.slug}`} className={p.slug === current ? "text-[var(--text)]" : "text-[var(--text-muted)] hover:text-[var(--text)]"}>
                  {p.title}
                </A>
              ))}
            </nav>
          )}
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-6 md:px-8 md:py-10">{children}</main>
      <footer className="border-t border-[var(--border)]">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-5 py-6 text-[13px] text-[var(--text-muted)] md:px-8">
          <span>{site.name}</span>
          <span>© {new Date().getFullYear()}</span>
        </div>
      </footer>
    </div>
  );
}

/** Stands in for Link inside the preview pane: the words, going nowhere. */
function PreviewLink({ children, className }: { href: string; className?: string; children: React.ReactNode }) {
  return <span className={className}>{children}</span>;
}

/** A real site with nothing published yet. A page, not an error. */
function ComingSoon({ site }: { site: Site }) {
  const theme = siteTheme(site);
  return (
    <main data-surface="site" data-theme={theme.mode} style={themeVars(theme) as React.CSSProperties} className="flex min-h-screen items-center justify-center bg-[var(--bg)] p-6 text-[var(--text)]">
      <div className="text-center">
        <p className="text-2xl font-semibold">{site.name}</p>
        <p className="mt-2 text-[var(--text-muted)]">Something is on its way.</p>
      </div>
    </main>
  );
}
