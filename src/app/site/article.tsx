import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { siteFromHost } from "@/modules/sites/server";
import { publishedArticle, publishedArticles, type ArticleRow } from "@/modules/articles/server";
import { mediaUrl } from "@/modules/media/server";
import { Placeholder } from "@/lib/placeholder";
import type { Site } from "@/db/schema";
import type { Metadata } from "next";
import { Frame, storefrontMenu } from "./storefront";
import { hostAndSite, storefrontMetadata } from "./metadata";

/**
 * The journal: /journal lists every live article newest first; an
 * article reads at /journal/<slug>. Same frame and theme as the pages.
 */
export async function Journal() {
  const site = await currentSite();
  if (!site) return <Placeholder surface="site" />;
  const [list, menu] = await Promise.all([publishedArticles({ siteId: site.id }), storefrontMenu(site.id)]);
  return (
    <Frame site={site} menu={menu} current="journal">
      <h1 className="pt-6 text-[34px] font-semibold leading-[1.1] tracking-[-0.8px] md:pt-10 md:text-[44px]">Journal</h1>
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

export async function ArticlePage({ slug }: { slug: string }) {
  const site = await currentSite();
  if (!site) return <Placeholder surface="site" />;
  const [a, menu] = await Promise.all([publishedArticle({ siteId: site.id, slug }), storefrontMenu(site.id)]);
  if (!a) notFound();
  return (
    <Frame site={site} menu={menu} current="journal">
      <ArticleBody article={a} site={site} />
    </Frame>
  );
}

/** The article itself, shared with the editor's preview. */
export function ArticleBody({ article: a, site, preview = false }: { article: ArticleRow; site: Site; preview?: boolean }) {
  const cover = a.cover ? mediaUrl(a.cover.key) : "";
  return (
    <article className="mx-auto max-w-3xl py-8 md:py-14">
      <p className="mb-3 font-mono text-[11.5px] uppercase tracking-[1.5px] text-[var(--accent-text)]">{dateOf(a)}</p>
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
    <Link href={`/journal/${a.slug}`} className="flex gap-5 py-7 md:gap-8">
      {cover && a.cover && (
        // eslint-disable-next-line @next/next/no-img-element -- served straight from the bucket
        <img src={cover} alt="" width={a.cover.width} height={a.cover.height} className="h-24 w-24 flex-none rounded-[8px] object-cover md:h-36 md:w-52" />
      )}
      <span className="min-w-0 flex-1">
        <span className="block font-mono text-[11px] uppercase tracking-[1.4px] text-[var(--accent-text)]">{dateOf(a)}</span>
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

export async function articleMetadata(slug: string): Promise<Metadata> {
  const { host, site } = await hostAndSite();
  if (!site) return { title: "output/input" };
  const a = await publishedArticle({ siteId: site.id, slug });
  if (!a) return { title: site.name, robots: { index: false, follow: false } };
  return storefrontMetadata({ site, seo: a.seo, title: a.title, fallbackDescription: a.excerpt || a.body, fallbackImage: a.cover, path: `/journal/${a.slug}`, host });
}
