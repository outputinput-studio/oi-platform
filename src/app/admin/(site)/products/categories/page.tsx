import { headers } from "next/headers";
import { siteAddress } from "@/lib/hosts";
import { requireSiteAccess } from "@/modules/auth/access";
import { listProductCategories } from "@/modules/products/categories";
import { Card, PageHeader } from "../../../ui";
import { AddCategory, CategoryList } from "./category-forms";

export const dynamic = "force-dynamic";

/** Product categories, as in design/admin.html: how people browse the shop, in the order you drag them. */
export default async function ProductCategoriesPage() {
  const { user, site } = await requireSiteAccess();
  const cats = await listProductCategories({ actorId: user.id, siteId: site.id });
  const siteHost = siteAddress(site, (await headers()).get("x-oi-host") ?? "");
  return (
    <>
      <PageHeader title="Categories" back="/products" actions={<AddCategory />} />
      <div className="max-w-[640px] pt-5 md:pt-6">
        {cats.length === 0 ? (
          <Card className="px-5 py-8 text-center">
            <p className="text-[15px] font-medium">Categories go here</p>
            <p className="mt-1 text-[13px] text-muted">Categories are how people browse your shop. Two or three is plenty to start.</p>
          </Card>
        ) : (
          <>
            <p className="mb-3 text-[13px] text-muted">Drag to set the order they appear on your site. Each is a page at /shop/…</p>
            <CategoryList categories={cats.map((c) => ({ id: c.id, name: c.name, slug: c.slug, description: c.description, productCount: c.productCount }))} siteHost={siteHost} />
          </>
        )}
      </div>
    </>
  );
}
