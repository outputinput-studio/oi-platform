import Link from "next/link";
import { headers } from "next/headers";
import { notFound, permanentRedirect } from "next/navigation";
import { recordNotFound, redirectFor } from "@/modules/redirects/server";
import { siteFromHost, siteSearch, siteTheme } from "@/modules/sites/server";
import { businessOf, tradingName } from "@/modules/sites/business";
import { publicForm } from "@/modules/forms/server";
import { StorefrontForm } from "./storefront-form";
import { SOCIAL_NETWORKS, socialLinks } from "@/modules/sites/search";
import { mediaUrl } from "@/modules/media/server";
import { themeVars } from "@/modules/sites/theme";
import { HOME_SLUG, publishedPage } from "@/modules/pages/server";
import { siteMenus, type SiteMenus } from "@/modules/menus/server";
import type { NavLink } from "@/modules/menus/items";
import { CartLink } from "./cart-link";
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

  const [page, menus] = await Promise.all([slug ? publishedPage({ siteId: site.id, slug }) : null, siteMenus({ siteId: site.id })]);
  if (!page) {
    if (slug === HOME_SLUG) return <ComingSoon site={site} />;
    return missing(site.id, requestPath ?? `/${slug}`, h.get("referer"));
  }

  return (
    <Frame site={site} menus={menus} current={page.slug === HOME_SLUG ? "/" : `/${page.slug}`}>
      {page.slug === HOME_SLUG && <OrganizationSchema site={site} host={host} />}
      <h1 className="sr-only">{page.title}</h1>
      <RenderSections sections={page.sections} />
    </Frame>
  );
}

/** What Google is told about the business, on the front page only: schema.org Organization. */
function OrganizationSchema({ site, host }: { site: Site; host: string }) {
  const b = siteSearch(site).business;
  const profile = businessOf(site);
  const data: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: profile.tradingName || site.name,
    url: `https://${host}/`,
  };
  if (b.description) data.description = b.description;
  const logo = siteTheme(site).logo ?? b.logo;
  if (logo) data.logo = mediaUrl(logo.key);
  if (profile.phone) data.telephone = profile.phone;
  if (profile.email) data.email = profile.email;
  if (profile.address) data.address = profile.address.replace(/\s*\n\s*/g, ", ");
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

/**
 * The frame every storefront page sits in: theme, header with the menu,
 * footer with its columns. The editor's preview renders the same frame
 * (`preview`): links become plain text there, so nothing inside the
 * preview pane navigates. `current` is the path being shown, so its menu
 * item reads as the one you're on.
 */
export function Frame({
  site,
  menus,
  current,
  preview = false,
  children,
}: {
  site: Site;
  menus: SiteMenus;
  current: string;
  preview?: boolean;
  children: React.ReactNode;
}) {
  const theme = siteTheme(site);
  const A = preview ? PreviewLink : Link;
  const b = siteSearch(site).business;
  const social = SOCIAL_NETWORKS.map(([k, name]) => [name, b[k]] as const).filter(([, href]) => href);
  const on = (href: string) => href === current || (href !== "/" && current.startsWith(href + "/"));
  return (
    <div data-surface="site" data-theme={theme.mode} style={themeVars(theme) as React.CSSProperties} className="flex min-h-screen flex-col bg-[var(--bg)] text-[var(--text)]">
      <header className="border-b border-[var(--border)]">
        <div className="mx-auto flex min-h-16 w-full max-w-5xl items-center justify-between gap-6 px-5 py-3 md:px-8">
          <A href="/" className="flex-none text-[17px] font-semibold tracking-[-0.2px]">
            {theme.logo ? (
              // eslint-disable-next-line @next/next/no-img-element -- served straight from the bucket
              <img src={mediaUrl(theme.logo.key)} alt={theme.logo.alt || site.name} width={theme.logo.width} height={theme.logo.height} className="block h-9 w-auto max-w-[200px] object-contain" />
            ) : (
              site.name
            )}
          </A>
          <div className="flex items-center gap-5">
          {menus.header.length > 0 && (
            <nav aria-label="Pages" className="flex flex-wrap items-center justify-end gap-x-5 gap-y-1.5 text-[14px]">
              {menus.header.map((l, i) =>
                l.children.length ? (
                  <Dropdown key={i} link={l} on={on} preview={preview} />
                ) : (
                  <MenuLink key={i} link={l} preview={preview} className={on(l.href) ? "text-[var(--text)]" : "text-[var(--text-muted)] hover:text-[var(--text)]"} />
                ),
              )}
            </nav>
          )}
          {!preview && <CartLink site={site} />}
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-6 md:px-8 md:py-10">{children}</main>
      <footer className="border-t border-[var(--border)]">
        {menus.footer.length > 0 && (
          <div className="mx-auto grid w-full max-w-5xl grid-cols-2 gap-x-6 gap-y-7 px-5 pt-8 md:grid-cols-4 md:px-8">
            {menus.footer.map((col, i) => (
              <nav key={i} aria-label={col.title || "Footer"} className="text-[14px]">
                {col.title && <p className="mb-2.5 text-[12px] font-medium uppercase tracking-[1px] text-[var(--text-muted)]">{col.title}</p>}
                <ul className="space-y-2">
                  {col.links.flatMap((l) => [l, ...l.children]).map((l, j) => (
                    <li key={j}>
                      <MenuLink link={l} preview={preview} className="text-[var(--text-body)] hover:text-[var(--text)]" />
                    </li>
                  ))}
                </ul>
              </nav>
            ))}
          </div>
        )}
        {!preview && theme.footer.newsletterFormId && <FooterForm siteId={site.id} formId={theme.footer.newsletterFormId} heading={theme.footer.newsletterHeading} />}
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-x-6 gap-y-3 px-5 py-6 text-[13px] text-[var(--text-muted)] md:px-8">
          <span>
            © {new Date().getFullYear()} {tradingName(site)}
          </span>
          {social.length > 0 && (
            <nav aria-label="Social" className="flex flex-wrap gap-x-4 gap-y-1">
              {social.map(([name, href]) => (
                <a key={name} href={href} target="_blank" rel="noopener noreferrer" className="hover:text-[var(--text)]">
                  {name}
                </a>
              ))}
            </nav>
          )}
        </div>
      </footer>
    </div>
  );
}

/** One menu link: inside the site, out to the web (maybe in a new tab), or plain words in the preview. */
function MenuLink({ link, preview, className }: { link: NavLink; preview: boolean; className?: string }) {
  if (preview) return <span className={className}>{link.label}</span>;
  if (link.external)
    return (
      <a href={link.href} className={className} {...(link.newTab ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
        {link.label}
      </a>
    );
  return (
    <Link href={link.href} className={className}>
      {link.label}
    </Link>
  );
}

/**
 * An item with children: a marker that opens them in place. On a
 * computer they drop down under it; on a phone the same. No script —
 * <details> does the opening, so it works before anything loads.
 */
function Dropdown({ link, on, preview }: { link: NavLink; on: (href: string) => boolean; preview: boolean }) {
  const active = on(link.href) || link.children.some((c) => on(c.href));
  return (
    <details className="group relative">
      <summary className={`flex cursor-pointer list-none items-center gap-1 [&::-webkit-details-marker]:hidden ${active ? "text-[var(--text)]" : "text-[var(--text-muted)] hover:text-[var(--text)]"}`}>
        {link.label}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="group-open:rotate-180" aria-hidden>
          <path d="m6 9 6 6 6-6" />
        </svg>
      </summary>
      <ul className="absolute right-0 top-full z-20 mt-2 min-w-48 rounded-[8px] border border-[var(--border)] bg-[var(--surface)] py-1.5 shadow-[0_12px_32px_-8px_rgba(0,0,0,0.45)]">
        {[link, ...link.children].map((c, i) => (
          <li key={i}>
            <MenuLink link={c} preview={preview} className={`block px-4 py-2 ${on(c.href) ? "text-[var(--text)]" : "text-[var(--text-body)] hover:text-[var(--text)]"}`} />
          </li>
        ))}
      </ul>
    </details>
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

/** The form at the foot of every page (Settings · Footer), usually a newsletter signup. Nothing if it's gone. */
async function FooterForm({ siteId, formId, heading }: { siteId: string; formId: string; heading: string }) {
  const form = await publicForm({ siteId, formId });
  if (!form) return null;
  return (
    <section data-testid="footer-form" className="mx-auto w-full max-w-5xl px-5 pt-8 md:px-8">
      {heading && <h2 className="mb-3 text-[18px] font-medium">{heading}</h2>}
      <StorefrontForm form={{ id: form.id, fields: form.fields, buttonText: form.buttonText, afterMessage: form.afterMessage }} />
    </section>
  );
}
