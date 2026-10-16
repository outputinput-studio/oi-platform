import Link from "next/link";
import { headers } from "next/headers";
import { notFound, permanentRedirect } from "next/navigation";
import { recordNotFound, redirectFor } from "@/modules/redirects/server";
import { siteFromHost, siteSearch, siteTheme } from "@/modules/sites/server";
import { socialLinks } from "@/modules/sites/search";
import { mediaUrl } from "@/modules/media/server";
import { themeVars } from "@/modules/sites/theme";
import { HOME_SLUG, publishedPage, publishedPages } from "@/modules/pages/server";
import { hasPublishedArticles } from "@/modules/articles/server";
import { RenderSections } from "@/modules/pages/render";
import { Placeholder } from "@/lib/placeholder";
import type { Site } from "@/db/schema";
import type { Metadata } from "next";
import { fallbacksFromSections, hostAndSite, storefrontMetadata } from "./metadata";

/**
 * A storefront page: the site comes from the hostname, the page from the
 * path, and only published pages render. The look is the site's theme
 * (dark or light, its own accent), applied as CSS variables on the frame,
 * so every section below reads tokens and never a colour.
 */
export async function Storefront({ slug, requestPath }: { slug: string | null; requestPath?: string }) {
  const h = await headers();
  const host = h.get("x-oi-host") ?? h.get("host") ?? "";
  const site = await siteFromHost(host);
  if (!site) return <Placeholder surface="site" />; // no such site: keep the stage-1 placeholder

  const [page, menu] = await Promise.all([slug ? publishedPage({ siteId: site.id, slug }) : null, storefrontMenu(site.id)]);
  if (!page) {
    if (slug === HOME_SLUG) return <ComingSoon site={site} />;
    return missing(site.id, requestPath ?? `/${slug}`, h.get("referer"));
  }

  return (
    <Frame site={site} menu={menu} current={page.slug}>
      {page.slug === HOME_SLUG && <OrganizationSchema site={site} host={host} />}
      <h1 className="sr-only">{page.title}</h1>
      <RenderSections sections={page.sections} />
    </Frame>
  );
}

/** What Google is told about the business, on the front page only: schema.org Organization. */
function OrganizationSchema({ site, host }: { site: Site; host: string }) {
  const b = siteSearch(site).business;
  const data: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: b.name || site.name,
    url: `https://${host}/`,
  };
  if (b.description) data.description = b.description;
  if (b.logo) data.logo = mediaUrl(b.logo.key);
  if (b.phone) data.telephone = b.phone;
  if (b.email) data.email = b.email;
  const same = socialLinks(b);
  if (same.length) data.sameAs = same;
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }} />;
}

/** <head> for a storefront page: the client's words, or ones from the sections. Nothing for a page that isn't live. */
export async function pageMetadata(slug: string): Promise<Metadata> {
  const { host, site } = await hostAndSite();
  if (!site) return { title: "output/input" };
  const page = await publishedPage({ siteId: site.id, slug });
  if (!page) return { title: site.name, robots: { index: false, follow: false } };
  const fb = fallbacksFromSections(page.sections);
  return storefrontMetadata({ site, seo: page.seo, title: slug === HOME_SLUG ? site.name : page.title, fallbackDescription: fb.description, fallbackImage: fb.image, path: slug === HOME_SLUG ? "/" : `/${slug}`, host });
}

/**
 * An address that isn't a live page: follow a redirect if the team made
 * one, otherwise remember the miss for Settings · Redirects and 404.
 */
export async function missing(siteId: string, path: string, referrer: string | null): Promise<never> {
  const to = await redirectFor({ siteId, path });
  if (to) permanentRedirect(to);
  await recordNotFound({ siteId, path, referrer });
  notFound();
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
