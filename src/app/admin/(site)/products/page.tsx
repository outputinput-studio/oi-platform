import Link from "next/link";
import { requireSiteAccess } from "@/modules/auth/access";
import { listProducts } from "@/modules/products/server";
import { listProductCategories } from "@/modules/products/categories";
import { adminTag, makeLine } from "@/modules/products/catalogue";
import { mediaUrl } from "@/modules/media/server";
import { siteShop } from "@/modules/sites/server";
import { paymentsStatus } from "@/modules/payments/server";
import { formatPrice } from "@/modules/sites/shop";
import { Card, Chevron, Chips, PageHeader } from "../../ui";
import { AddProduct } from "./add-product";

export const dynamic = "force-dynamic";

/**
 * Products, as in design/admin.html: a note while nothing can be bought,
 * chips by category, then every piece with its photo, price, how it's
 * made and anything unusual about it (hidden, sold, sold out…).
 */
export default async function ProductsPage({ searchParams }: { searchParams: Promise<{ category?: string }> }) {
  const { category } = await searchParams;
  const { user, site } = await requireSiteAccess();
  const [all, cats] = await Promise.all([listProducts({ actorId: user.id, siteId: site.id }), listProductCategories({ actorId: user.id, siteId: site.id })]);
  const { currency } = siteShop(site);
  const current = cats.find((c) => c.slug === category);
  const shown = current ? all.filter((p) => p.categoryId === current.id) : all;
  return (
    <>
      <PageHeader title="Products" back="/" actions={<AddProduct categories={cats.map((c) => ({ id: c.id, name: c.name }))} defaultCategory={current?.id} />} />
      <div className="pt-4 md:pt-5">
        {all.length > 0 && !paymentsStatus(site).ready && (
          <div data-testid="no-checkout" className="mb-4 flex items-center gap-3 rounded-card border border-warning bg-warning-bg px-4 py-3">
            <span className="min-w-0 flex-1">
              <span className="block text-[14px] font-medium text-text">Nothing can be bought yet</span>
              <span className="mt-0.5 block text-[12.5px] leading-[1.5] text-body">Your pieces are on the site, but Add to cart is hidden until Stripe is connected. Only you see this.</span>
            </span>
            <Link href="/settings/payments" className="flex-none rounded-button bg-accent px-3.5 py-2 text-[13.5px] font-medium text-text hover:bg-accent-hover">
              Connect Stripe
            </Link>
          </div>
        )}
        {cats.length > 0 && (
          <Chips
            ariaLabel="Categories"
            current={current ? `/products?category=${current.slug}` : "/products"}
            items={[{ href: "/products", label: "All", count: all.length }, ...cats.map((c) => ({ href: `/products?category=${c.slug}`, label: c.name, count: c.productCount }))]}
          />
        )}
        <Link href="/products/categories" className="mt-4 flex items-center justify-between rounded-card border border-line bg-surface px-4 py-3 hover:bg-hover">
          <span className="text-[14.5px]">Categories</span>
          <span className="flex items-center gap-1 text-[13px] text-muted">
            {cats.length}
            <Chevron />
          </span>
        </Link>

        {all.length === 0 ? (
          <Card className="mt-5 px-5 py-8 text-center">
            <p className="text-[15px] font-medium">Your products live here</p>
            <p className="mt-1 text-[13px] text-muted">Add your first piece with a photo from your camera roll. It takes about a minute. Add product is at the top.</p>
          </Card>
        ) : shown.length === 0 ? (
          <Card className="mt-5 px-5 py-8 text-center">
            <p className="text-[15px] font-medium">Nothing in {current?.name} yet</p>
            <p className="mt-1 text-[13px] text-muted">
              Add something to it, or{" "}
              <Link href="/products" className="text-accent-text underline underline-offset-4">
                show all products
              </Link>
              .
            </p>
          </Card>
        ) : (
          <ul className="mt-5 space-y-2.5">
            {shown.map((p) => {
              const photo = p.photos[0] ? mediaUrl(p.photos[0].key) : "";
              const tag = adminTag(p);
              const onSale = p.salePrice !== null && p.price !== null;
              return (
                <li key={p.id}>
                  <Link href={`/products/${p.id}`} data-testid={`product-${p.slug}`} className="block">
                    <Card className="flex gap-3 p-[14px] hover:bg-hover">
                      {photo ? (
                        // eslint-disable-next-line @next/next/no-img-element -- served straight from the bucket
                        <img src={photo} alt="" className="h-16 w-16 flex-none rounded object-cover" />
                      ) : (
                        <span className="h-16 w-16 flex-none rounded bg-sunken" />
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="flex items-start justify-between gap-2.5">
                          <span className="line-clamp-2 text-[15px] font-medium leading-[1.3]">{p.name}</span>
                          {tag && <span className={`flex-none rounded px-[7px] py-[3px] text-[10.5px] font-medium ${tag === "Hidden" ? "border border-line text-muted" : "bg-warning-bg text-warning"}`}>{tag}</span>}
                        </span>
                        <span className="mt-1 block font-mono text-[13px] text-body">
                          {p.price === null ? (
                            <span className="text-muted">No price yet</span>
                          ) : onSale ? (
                            <>
                              {formatPrice(p.salePrice!, currency)} <s className="text-muted">{formatPrice(p.price, currency)}</s>
                            </>
                          ) : (
                            formatPrice(p.price, currency)
                          )}
                        </span>
                        <span className="mt-0.5 block text-[12px] text-muted">{makeLine(p)}</span>
                      </span>
                    </Card>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
}
