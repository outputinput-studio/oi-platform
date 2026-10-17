import { headers } from "next/headers";
import { siteAddress } from "@/lib/hosts";
import { requireSiteAccess } from "@/modules/auth/access";
import { listCategories } from "@/modules/articles/categories";
import { Card, PageHeader } from "../../../ui";
import { AddCategory, CategoryList } from "./category-forms";

export const dynamic = "force-dynamic";

/** Article categories, as in design/admin.html: each is a page on the site, so the address matters. */
export default async function CategoriesPage() {
  const { user, site } = await requireSiteAccess();
  const cats = await listCategories({ actorId: user.id, siteId: site.id });
  const siteHost = siteAddress(site, (await headers()).get("x-oi-host") ?? "");
  return (
    <>
      <PageHeader title="Categories" back="/articles" actions={<AddCategory />} />
      <div className="max-w-[640px] pt-5 md:pt-6">
        {cats.length === 0 ? (
          <Card className="px-5 py-8 text-center">
            <p className="text-[15px] font-medium">Categories go here</p>
            <p className="mt-1 text-[13px] text-muted">Grouping articles gives Google a page per subject. Two or three is plenty to start.</p>
          </Card>
        ) : (
          <>
            <p className="mb-3 text-[13px] text-muted">Each category is a page on your site, so the web address matters. Drag to reorder.</p>
            <CategoryList categories={cats.map((c) => ({ id: c.id, name: c.name, slug: c.slug, description: c.description, articleCount: c.articleCount }))} siteHost={siteHost} />
          </>
        )}
      </div>
    </>
  );
}
