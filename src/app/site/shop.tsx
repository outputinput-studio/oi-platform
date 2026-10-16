import Link from "next/link";
import { headers } from "next/headers";
import type { Metadata } from "next";
import type { ProductCategory, Site } from "@/db/schema";
import { mediaUrl } from "@/modules/media/server";
import { siteMenus } from "@/modules/menus/server";
import { customerView, effectiveAvailability } from "@/modules/products/catalogue";
import { productCategoryBySlug, publishedProductCategories } from "@/modules/products/categories";
import { productPath, publishedProduct, publishedProducts, type ProductRow } from "@/modules/products/server";
import { siteShipping, siteShop } from "@/modules/sites/server";
import { paymentsStatus } from "@/modules/payments/server";
import { publicForm, type FormWithFields } from "@/modules/forms/server";
import { AddToCart } from "./add-to-cart";
import { Enquire } from "./enquire";
import { EmailQuote } from "./email-quote";
import { COUNTRIES } from "@/lib/countries";
import { homeCountry } from "@/modules/sites/shop";
import { Placeholder } from "@/lib/placeholder";
import { Frame, missing } from "./storefront";
import { hostAndSite, storefrontMetadata } from "./metadata";

/**
 * The shop: /shop lists every visible piece, /shop/<category> one
 * category's, /shop/<product> a piece of its own. Same frame and theme
 * as the pages. Add to cart shows once the site can take payments.
 */
export async function Shop({ category }: { category?: ProductCategory } = {}) {
  const { site } = await hostAndSite();
  if (!site) return <Placeholder surface="site" />;
  const [list, menus, cats] = await Promise.all([publishedProducts({ siteId: site.id, categoryId: category?.id }), siteMenus({ siteId: site.id }), publishedProductCategories({ siteId: site.id })]);
  const { currency } = siteShop(site);
  return (
    <Frame site={site} menus={menus} current={category ? `/shop/${category.slug}` : "/shop"}>
      <p className="pt-6 md:pt-10">
        {category && (
          <Link href="/shop" className="font-mono text-[11.5px] uppercase tracking-[1.5px] text-[var(--accent-text)]">
            Shop
          </Link>
        )}
      </p>
      <h1 className="mt-2 text-[34px] font-semibold leading-[1.1] tracking-[-0.8px] md:text-[44px]">{category ? category.name : "Shop"}</h1>
      {category?.description && <p className="mt-3 max-w-2xl text-[17px] text-[var(--text-body)]">{category.description}</p>}
      {cats.length > 0 && (
        <nav aria-label="Categories" className="mt-5 flex flex-wrap gap-2">
          <Chip href="/shop" on={!category}>
            All
          </Chip>
          {cats.map((c) => (
            <Chip key={c.id} href={`/shop/${c.slug}`} on={category?.id === c.id}>
              {c.name}
            </Chip>
          ))}
        </nav>
      )}
      {list.length === 0 ? (
        <p className="py-10 text-[var(--text-muted)]">Nothing here yet.</p>
      ) : (
        <ul className="grid grid-cols-2 gap-x-4 gap-y-8 pt-7 md:grid-cols-3 md:gap-x-6">
          {list.map((p) => {
            const v = customerView(p, currency);
            const [main, second] = p.photos;
            return (
              <li key={p.id}>
                <Link href={productPath(p)} className="group block">
                  <span className="relative block aspect-[4/5] overflow-hidden rounded-[8px] bg-[var(--surface)]">
                    {main && (
                      // eslint-disable-next-line @next/next/no-img-element -- served straight from the bucket
                      <img src={mediaUrl(main.key)} alt={main.alt} width={main.width} height={main.height} loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
                    )}
                    {second && (
                      // eslint-disable-next-line @next/next/no-img-element -- the second photo shows on hover
                      <img src={mediaUrl(second.key)} alt="" loading="lazy" className="absolute inset-0 hidden h-full w-full object-cover opacity-0 transition-opacity duration-300 group-hover:opacity-100 md:block" />
                    )}
                  </span>
                  <span className="mt-3 block text-[15px] leading-[1.35] group-hover:underline group-hover:underline-offset-4">{p.name}</span>
                  <span className="mt-1 block text-[14px]">
                    {v.price}
                    {v.was && <s className="ml-2 text-[var(--text-muted)]">{v.was}</s>}
                  </span>
                  <span className="mt-0.5 block text-[12.5px] text-[var(--text-muted)]">{v.note}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Frame>
  );
}

/** /shop/<x>: a category, or a piece. Anything else is a miss (with redirects tried first). */
export async function ShopEntry({ parts }: { parts: string[] }) {
  const { site } = await hostAndSite();
  if (!site) return <Placeholder surface="site" />;
  const path = `/shop/${parts.join("/")}`;
  const referer = (await headers()).get("referer");
  if (parts.length !== 1) return missing(site.id, path, referer);
  const cat = await productCategoryBySlug({ siteId: site.id, slug: parts[0] });
  if (cat) return <Shop category={cat} />;
  const p = await publishedProduct({ siteId: site.id, slug: parts[0] });
  if (!p) return missing(site.id, path, referer);
  const a = effectiveAvailability(p);
  const enquiryId = siteShop(site).enquiryFormId;
  const quotable = customerView(p, siteShop(site).currency).quotable;
  const [menus, enquiry] = await Promise.all([siteMenus({ siteId: site.id }), enquiryId && (a === "enquire" || a === "sold" || quotable) ? publicForm({ siteId: site.id, formId: enquiryId }) : null]);
  return (
    <Frame site={site} menus={menus} current={path}>
      <ProductPage product={p} site={site} enquiry={enquiry} />
    </Frame>
  );
}

function ProductPage({ product: p, site, enquiry }: { product: ProductRow; site: Site; enquiry: FormWithFields | null }) {
  const { currency } = siteShop(site);
  const v = customerView(p, currency);
  const a = effectiveAvailability(p);
  const [main, ...rest] = p.photos;
  return (
    <article className="grid gap-8 pt-6 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] md:gap-12 md:pt-10">
      <ProductSchema product={p} site={site} />
      <div className="space-y-3">
        {main ? (
          // eslint-disable-next-line @next/next/no-img-element -- served straight from the bucket
          <img src={mediaUrl(main.key)} alt={main.alt} width={main.width} height={main.height} className="w-full rounded-[8px] bg-[var(--surface)] object-cover" />
        ) : (
          <div className="aspect-[4/5] w-full rounded-[8px] bg-[var(--surface)]" />
        )}
        {rest.length > 0 && (
          <div className="grid grid-cols-2 gap-3">
            {rest.map((ph) => (
              // eslint-disable-next-line @next/next/no-img-element -- served straight from the bucket
              <img key={ph.key} src={mediaUrl(ph.key)} alt={ph.alt} width={ph.width} height={ph.height} loading="lazy" className="aspect-square w-full rounded-[8px] bg-[var(--surface)] object-cover" />
            ))}
          </div>
        )}
      </div>
      <div className="md:sticky md:top-8 md:self-start">
        {p.category && (
          <Link href={`/shop/${p.category.slug}`} className="font-mono text-[11.5px] uppercase tracking-[1.5px] text-[var(--accent-text)]">
            {p.category.name}
          </Link>
        )}
        <h1 className="mt-2 text-[28px] font-semibold leading-[1.15] tracking-[-0.5px] md:text-[34px]">{p.name}</h1>
        <p data-testid="product-price" className="mt-3 text-[20px]">
          {v.price}
          {v.was && <s className="ml-2 text-[16px] text-[var(--text-muted)]">{v.was}</s>}
        </p>
        <p data-testid="product-note" className="mt-1 text-[14px] text-[var(--text-muted)]">
          {v.note}
        </p>
        {v.buyable && p.make === "ready" && !p.digital && siteShipping(site).dispatchDays > 0 && (
          <p className="mt-1 text-[14px] text-[var(--text-muted)]">Posted within {siteShipping(site).dispatchDays} business days</p>
        )}
        {v.buyable && paymentsStatus(site).ready && <AddToCart productId={p.id} />}
        {v.quotable && enquiry && <EmailQuote productId={p.id} productName={p.name} alone={!(v.buyable && paymentsStatus(site).ready)} countries={COUNTRIES} defaultCountry={homeCountry(currency)} />}
        {enquiry && (a === "enquire" || a === "sold") && (
          <Enquire form={{ id: enquiry.id, fields: enquiry.fields, buttonText: enquiry.buttonText, afterMessage: enquiry.afterMessage }} productId={p.id} sold={a === "sold"} />
        )}
        {p.description && (
          <div className="mt-6 space-y-4 text-[16px] leading-[1.65] text-[var(--text-body)]">
            {p.description
              .split(/\n{2,}/)
              .map((para) => para.trim())
              .filter(Boolean)
              .map((para, i) => (
                <p key={i} className="whitespace-pre-line">
                  {para}
                </p>
              ))}
          </div>
        )}
      </div>
    </article>
  );
}

/** What Google is told about the piece: schema.org Product with its offer. */
function ProductSchema({ product: p, site }: { product: ProductRow; site: Site }) {
  const { currency } = siteShop(site);
  const a = effectiveAvailability(p);
  const availability =
    a === "sold" || a === "soldOut" ? "SoldOut" : a === "comingSoon" ? "PreOrder" : a === "enquire" ? null : p.make === "madeToOrder" ? "MadeToOrder" : "InStock";
  const price = p.salePrice ?? p.price;
  const data: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: p.name,
    ...(p.description ? { description: p.description.slice(0, 500) } : {}),
    ...(p.photos.length ? { image: p.photos.map((ph) => mediaUrl(ph.key)) } : {}),
    ...(p.code ? { sku: p.code } : {}),
    brand: { "@type": "Brand", name: site.name },
    ...(price !== null && availability
      ? { offers: { "@type": "Offer", price: (price / 100).toFixed(2), priceCurrency: currency, availability: `https://schema.org/${availability}` } }
      : {}),
  };
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }} />;
}

function Chip({ href, on, children }: { href: string; on: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={on ? "page" : undefined}
      className={`rounded-full border px-3.5 py-1.5 text-[13.5px] ${on ? "border-[var(--text)] bg-[var(--text)] text-[var(--bg)]" : "border-[var(--border)] text-[var(--text-body)] hover:text-[var(--text)]"}`}
    >
      {children}
    </Link>
  );
}

// ───────────────────────── <head> ─────────────────────────

export async function shopMetadata(): Promise<Metadata> {
  const { host, site } = await hostAndSite();
  if (!site) return { title: "output/input" };
  return storefrontMetadata({ site, seo: {}, title: "Shop", fallbackDescription: "", fallbackImage: null, path: "/shop", host });
}

export async function shopEntryMetadata(parts: string[]): Promise<Metadata> {
  const { host, site } = await hostAndSite();
  if (!site) return { title: "output/input" };
  if (parts.length !== 1) return { title: site.name, robots: { index: false, follow: false } };
  const cat = await productCategoryBySlug({ siteId: site.id, slug: parts[0] });
  if (cat) return storefrontMetadata({ site, seo: {}, title: cat.name, fallbackDescription: cat.description, fallbackImage: null, path: `/shop/${cat.slug}`, host });
  const p = await publishedProduct({ siteId: site.id, slug: parts[0] });
  if (!p) return { title: site.name, robots: { index: false, follow: false } };
  return storefrontMetadata({ site, seo: p.seo, title: p.name, fallbackDescription: p.description, fallbackImage: p.photos[0] ?? null, path: productPath(p), host });
}
