import Link from "next/link";
import { headers } from "next/headers";
import { siteFromHost } from "@/modules/sites/server";
import { articlePath, publishedArticle, publishedArticles, type ArticleRow } from "@/modules/articles/server";
import { publishedCategories, publishedCategory } from "@/modules/articles/categories";
import { permanentRedirect } from "next/navigation";
import type { ArticleCategory } from "@/db/schema";
import { mediaUrl } from "@/modules/media/server";
import { Placeholder } from "@/lib/placeholder";
import type { Site } from "@/db/schema";
import type { Metadata } from "next";
import { Frame, missing } from "./storefront";
import { siteMenus } from "@/modules/menus/server";
import { hostAndSite, storefrontMetadata } from "./metadata";

/**
 * The journal: /journal lists every live article newest first; an
 * article reads at /journal/<slug>. Same frame and theme as the pages.
 */
export async function Journal({ category }: { category?: ArticleCategory } = {}) {
  const site = await currentSite();
  if (!site) return <Placeholder surface="site" />;
  const [list, menus, cats] = await Promise.all([publishedArticles({ siteId: site.id, categoryId: category?.id }), siteMenus({ siteId: site.id }), publishedCategories({ siteId: site.id })]);
  return (
    <Frame site={site} menus={menus} current={category ? `/journal/${category.slug}` : "/journal"}>
      <p className="pt-6 md:pt-10">
        {category && (
          <Link href="/journal" className="font-mono text-[11.5px] uppercase tracking-[1.5px] text-[var(--accent-text)]">
            Journal
          </Link>
        )}
      </p>
      <h1 className="mt-2 text-[34px] font-semibold leading-[1.1] tracking-[-0.8px] md:text-[44px]">{category ? category.name : "Journal"}</h1>
      {category?.description && <p className="mt-3 max-w-2xl text-[17px] text-[var(--text-body)]">{category.description}</p>}
      {cats.length > 0 && (
        <nav aria-label="Categories" className="mt-5 flex flex-wrap gap-2">
          <Chip href="/journal" on={!category}>
            All
          </Chip>
          {cats.map((c) => (
            <Chip key={c.id} href={`/journal/${c.slug}`} on={category?.id === c.id}>
              {c.name}
            </Chip>
          ))}
        </nav>
      )}
      {list.length === 0 ? (
        <p className="py-10 text-[var(--text-muted)]">Nothing here yet.</p>
      ) : (
        <ul className="divide-y divide-[var(--border-soft)] pt-6">
          {list.map((a) => (
            <li key={a.id}>
              <ArticleCard article={a} />
            </li>
          ))}
        </ul>
      )}
    </Frame>
  );
}

/**
 * Anything under /journal/: one part is a category page or an article
 * with no main category; two parts is an article under its category. An
 * article reached by the wrong address is sent to the right one.
 */
export async function JournalEntry({ parts }: { parts: string[] }) {
  const site = await currentSite();
  if (!site) return <Placeholder surface="site" />;
  const path = `/journal/${parts.join("/")}`;
  if (parts.length === 1) {
    const cat = await publishedCategory({ siteId: site.id, slug: parts[0] });
    if (cat) return <Journal category={cat} />;
  }
  if (parts.length > 2) return missing(site.id, path, (await headers()).get("referer"));
  const a = await publishedArticle({ siteId: site.id, slug: parts[parts.length - 1] });
  if (!a) return missing(site.id, path, (await headers()).get("referer"));
  const canonical = articlePath(a);
  if (canonical !== path) permanentRedirect(canonical);
  const menus = await siteMenus({ siteId: site.id });
  return (
    <Frame site={site} menus={menus} current={canonical}>
      <ArticleBody article={a} site={site} />
    </Frame>
  );
}

function Chip({ href, on, children }: { href: string; on: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={on ? "page" : undefined}
      className={`rounded-full border px-3.5 py-1.5 text-[13.5px] ${on ? "border-[var(--text)] bg-[var(--text)] text-[var(--bg)]" : "border-[var(--border)] text-[var(--text-body)] hover:border-[var(--text)]"}`}
    >
      {children}
    </Link>
  );
}

/** The article itself, shared with the editor's preview. */
export function ArticleBody({ article: a, site, preview = false }: { article: ArticleRow; site: Site; preview?: boolean }) {
  const cover = a.cover ? mediaUrl(a.cover.key) : "";
  return (
    <article className="mx-auto max-w-3xl py-8 md:py-14">
      <p className="mb-3 font-mono text-[11.5px] uppercase tracking-[1.5px] text-[var(--accent-text)]">
        {a.category && !preview ? (
          <>
            <Link href={`/journal/${a.category.slug}`}>{a.category.name}</Link> · {dateOf(a)}
          </>
        ) : a.category ? (
          `${a.category.name} · ${dateOf(a)}`
        ) : (
          dateOf(a)
        )}
      </p>
      <h1 className="text-[34px] font-semibold leading-[1.1] tracking-[-0.8px] md:text-[48px]">{a.title}</h1>
      <p className="mt-3 text-[15px] text-[var(--text-muted)]">By {a.author || site.name}</p>
      {cover && a.cover && (
        // eslint-disable-next-line @next/next/no-img-element -- served straight from the bucket
        <img src={cover} alt={a.cover.alt} width={a.cover.width} height={a.cover.height} className="mt-8 aspect-[16/9] w-full rounded-[8px] object-cover" />
      )}
      <div className="mt-8">
        {a.body
          .split(/\n{2,}/)
          .filter((p) => p.trim())
          .map((p, i) => (
            <p key={i} className="mb-5 text-[18px] leading-[1.7] text-[var(--text-body)] last:mb-0">
              {p}
            </p>
          ))}
        {!a.body.trim() && preview && <p className="text-[var(--text-muted)]">Nothing written yet.</p>}
      </div>
      {!preview && (
        <p className="mt-12 border-t border-[var(--border-soft)] pt-6 text-[14px]">
          <Link href="/journal" className="text-[var(--accent-text)]">
            ← All articles
          </Link>
        </p>
      )}
    </article>
  );
}

function ArticleCard({ article: a }: { article: ArticleRow }) {
  const cover = a.cover ? mediaUrl(a.cover.key) : "";
  return (
    <Link href={articlePath(a)} className="flex gap-5 py-7 md:gap-8">
      {cover && a.cover && (
        // eslint-disable-next-line @next/next/no-img-element -- served straight from the bucket
        <img src={cover} alt="" width={a.cover.width} height={a.cover.height} className="h-24 w-24 flex-none rounded-[8px] object-cover md:h-36 md:w-52" />
      )}
      <span className="min-w-0 flex-1">
        <span className="block font-mono text-[11px] uppercase tracking-[1.4px] text-[var(--accent-text)]">{a.category ? `${a.category.name} · ` : ""}{dateOf(a)}</span>
        <span className="mt-2 block text-[22px] font-semibold leading-[1.2] tracking-[-0.4px] md:text-[26px]">{a.title}</span>
        {a.excerpt && <span className="mt-2 block text-[16px] leading-relaxed text-[var(--text-body)]">{a.excerpt}</span>}
      </span>
    </Link>
  );
}

function dateOf(a: ArticleRow): string {
  return (a.publishedAt ?? a.createdAt).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" });
}

async function currentSite() {
  const h = await headers();
  return siteFromHost(h.get("x-oi-host") ?? h.get("host") ?? "");
}

export async function journalMetadata(): Promise<Metadata> {
  const { host, site } = await hostAndSite();
  if (!site) return { title: "output/input" };
  const list = await publishedArticles({ siteId: site.id });
  return storefrontMetadata({ site, seo: {}, title: "Journal", fallbackDescription: list[0]?.excerpt ?? "", fallbackImage: list.find((a) => a.cover)?.cover ?? null, path: "/journal", host });
}

export async function journalEntryMetadata(parts: string[]): Promise<Metadata> {
  const { host, site } = await hostAndSite();
  if (!site) return { title: "output/input" };
  if (parts.length === 1) {
    const cat = await publishedCategory({ siteId: site.id, slug: parts[0] });
    if (cat) {
      const list = await publishedArticles({ siteId: site.id, categoryId: cat.id });
      return storefrontMetadata({ site, seo: {}, title: cat.name, fallbackDescription: cat.description || list[0]?.excerpt || "", fallbackImage: list.find((a) => a.cover)?.cover ?? null, path: `/journal/${cat.slug}`, host });
    }
  }
  const a = parts.length <= 2 ? await publishedArticle({ siteId: site.id, slug: parts[parts.length - 1] }) : null;
  if (!a) return { title: site.name, robots: { index: false, follow: false } };
  return storefrontMetadata({ site, seo: a.seo, title: a.title, fallbackDescription: a.excerpt || a.body, fallbackImage: a.cover, path: articlePath(a), host });
}
