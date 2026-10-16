import Link from "next/link";
import type { Metadata } from "next";
import { Placeholder } from "@/lib/placeholder";
import { MAX_QUERY, searchWords, snippet } from "@/lib/search";
import { mediaUrl } from "@/modules/media/server";
import { siteMenus } from "@/modules/menus/server";
import { articlePath, searchArticles } from "@/modules/articles/server";
import { HOME_SLUG, searchPages } from "@/modules/pages/server";
import { searchProducts } from "@/modules/products/server";
import { siteSearch, siteShop, siteTheme } from "@/modules/sites/server";
import { pageTitle } from "@/modules/sites/search";
import { Frame } from "./storefront";
import { hostAndSite } from "./metadata";
import { ProductGrid } from "./shop";

/**
 * /search: the whole site — products, pages and the journal — for the
 * words typed. Every word has to turn up somewhere in a result. A plain
 * form (it works without JavaScript); the results are never indexed.
 */
export async function SearchPage({ q: raw }: { q: string }) {
  const { site } = await hostAndSite();
  if (!site) return <Placeholder surface="site" />;
  const q = raw.trim().slice(0, MAX_QUERY);
  const words = searchWords(q);
  const [menus, products, pages, articles] = await Promise.all([
    siteMenus({ siteId: site.id }),
    searchProducts({ siteId: site.id, words }),
    searchPages({ siteId: site.id, words }),
    searchArticles({ siteId: site.id, words }),
  ]);
  const total = products.length + pages.length + articles.length;
  return (
    <Frame site={site} menus={menus} current="/search">
      <h1 className="pt-6 text-[34px] font-semibold tracking-[-0.8px] md:pt-10 md:text-[44px]">Search</h1>
      <form action="/search" role="search" className="mt-5 flex max-w-xl gap-2">
        <input
          type="search"
          name="q"
          defaultValue={q}
          maxLength={MAX_QUERY}
          aria-label="Search the site"
          placeholder="What are you looking for?"
          autoFocus={!q}
          className="block h-12 min-w-0 flex-1 rounded-[6px] border border-[var(--border)] bg-transparent px-3.5 text-[16px] outline-none focus:border-[var(--accent)]"
        />
        <button type="submit" className="h-12 flex-none rounded-[6px] bg-[var(--accent)] px-5 text-[15px] font-medium text-[var(--accent-fg)] hover:opacity-90">
          Search
        </button>
      </form>

      {words.length > 0 && (
        <p data-testid="search-summary" className="mt-6 text-[15px] text-[var(--text-muted)]">
          {total === 0 ? (
            <>
              Nothing matched &ldquo;{q}&rdquo;. Try fewer words, or other ones.
            </>
          ) : (
            <>
              {total} result{total === 1 ? "" : "s"} for &ldquo;{q}&rdquo;
            </>
          )}
        </p>
      )}

      {products.length > 0 && (
        <section data-testid="search-products" className="mt-8">
          <h2 className="font-mono text-[11.5px] uppercase tracking-[1.5px] text-[var(--accent-text)]">Shop</h2>
          <ProductGrid products={products} currency={siteShop(site).currency} />
        </section>
      )}

      {pages.length > 0 && (
        <section data-testid="search-pages" className="mt-10">
          <h2 className="font-mono text-[11.5px] uppercase tracking-[1.5px] text-[var(--accent-text)]">Pages</h2>
          <ul className="mt-3 divide-y divide-[var(--border-soft)] border-y border-[var(--border-soft)]">
            {pages.map((p) => (
              <li key={p.slug}>
                <Link href={p.slug === HOME_SLUG ? "/" : `/${p.slug}`} className="group block py-4">
                  <span className="block text-[17px] font-medium group-hover:underline group-hover:underline-offset-4">{p.title}</span>
                  {p.hit && <span className="mt-1 block text-[14.5px] leading-[1.55] text-[var(--text-body)]">{snippet(p.hit, words)}</span>}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {articles.length > 0 && (
        <section data-testid="search-articles" className="mt-10">
          <h2 className="font-mono text-[11.5px] uppercase tracking-[1.5px] text-[var(--accent-text)]">Journal</h2>
          <ul className="mt-3 divide-y divide-[var(--border-soft)] border-y border-[var(--border-soft)]">
            {articles.map((a) => (
              <li key={a.id}>
                <Link href={articlePath(a)} className="group flex gap-4 py-4">
                  {a.cover && (
                    // eslint-disable-next-line @next/next/no-img-element -- served straight from the bucket
                    <img src={mediaUrl(a.cover.key)} alt="" loading="lazy" className="h-20 w-20 flex-none rounded-[6px] bg-[var(--surface)] object-cover" />
                  )}
                  <span className="min-w-0">
                    <span className="block text-[17px] font-medium group-hover:underline group-hover:underline-offset-4">{a.title}</span>
                    <span className="mt-1 block text-[14.5px] leading-[1.55] text-[var(--text-body)]">{snippet(`${a.excerpt} ${a.body}`, words) || a.excerpt}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </Frame>
  );
}

/** Search results are for the person searching, not for Google. */
export async function searchMetadata(q: string): Promise<Metadata> {
  const { site } = await hostAndSite();
  if (!site) return { title: "Search", robots: { index: false, follow: false } };
  const favicon = siteTheme(site).favicon;
  return {
    title: pageTitle(siteSearch(site).titlePattern, q.trim() ? `Search: ${q.trim().slice(0, 60)}` : "Search", site.name),
    robots: { index: false, follow: true },
    ...(favicon ? { icons: { icon: [{ url: mediaUrl(favicon.key) }] } } : {}),
  };
}
