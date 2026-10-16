import { headers } from "next/headers";
import { requireSiteAccess } from "@/modules/auth/access";
import { getProduct } from "@/modules/products/server";
import { listProductCategories } from "@/modules/products/categories";
import { deleteProductAction } from "@/modules/products/actions";
import { mediaAvailable, mediaUrl } from "@/modules/media/server";
import { readSeo } from "@/modules/pages/seo";
import { siteShop } from "@/modules/sites/server";
import { ProductEditor } from "./product-editor";

export const dynamic = "force-dynamic";

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, site } = await requireSiteAccess();
  const [p, cats] = await Promise.all([getProduct({ actorId: user.id, siteId: site.id, productId: id }), listProductCategories({ actorId: user.id, siteId: site.id })]);
  const siteHost = ((await headers()).get("x-oi-host") ?? "").replace(/^admin\./, `${site.slug}.`);
  const shop = siteShop(site);
  const seo = readSeo(p.seo);
  const main = p.photos[0];
  return (
    <ProductEditor
      product={{
        id: p.id,
        name: p.name,
        slug: p.slug,
        description: p.description,
        price: p.price,
        salePrice: p.salePrice,
        categoryId: p.category?.id ?? null,
        digital: p.digital,
        make: p.make,
        stock: p.stock,
        leadTime: p.leadTime,
        leadUnit: p.leadUnit,
        availability: p.availability,
        visible: p.visible,
        photos: p.photos,
        code: p.code,
      }}
      photoUrls={Object.fromEntries(p.photos.map((ph) => [ph.key, mediaUrl(ph.key)]))}
      categories={cats.map((c) => ({ id: c.id, name: c.name }))}
      currency={shop.currency}
      taxNote={shop.pricesIncludeTax ? `Prices include ${shop.taxName}.` : `Prices don't include ${shop.taxName}.`}
      siteHost={siteHost}
      mediaAvailable={mediaAvailable()}
      seo={{ initial: seo, imageUrl: seo.image ? mediaUrl(seo.image.key) : undefined, fallback: { title: `${p.name} · ${site.name}`, description: p.description, imageUrl: main ? mediaUrl(main.key) : undefined } }}
      deleteAction={deleteProductAction}
    />
  );
}
