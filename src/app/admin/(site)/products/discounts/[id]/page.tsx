import { requireSiteAccess } from "@/modules/auth/access";
import { getCode } from "@/modules/discounts/server";
import { listProductCategories } from "@/modules/products/categories";
import { listProducts } from "@/modules/products/server";
import { siteShop } from "@/modules/sites/server";
import { PageHeader } from "../../../../ui";
import { CodeEditor } from "./code-editor";

export const dynamic = "force-dynamic";

export default async function CodePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, site } = await requireSiteAccess();
  const [code, cats, products] = await Promise.all([
    id === "new" ? null : getCode({ actorId: user.id, siteId: site.id, codeId: id }),
    listProductCategories({ actorId: user.id, siteId: site.id }),
    listProducts({ actorId: user.id, siteId: site.id }),
  ]);
  return (
    <>
      <PageHeader title={code ? code.code : "New code"} back="/products/discounts" />
      <div className="max-w-[640px] pt-5 md:pt-6">
        <CodeEditor
          codeId={code?.id}
          initial={
            code
              ? { code: code.code, kind: code.kind, value: code.value, appliesTo: code.appliesTo, categoryId: code.categoryId, productIds: code.productIds, minSpend: code.minSpend, maxUses: code.maxUses, perPerson: code.perPerson, startsAt: code.startsAt?.toISOString().slice(0, 10) ?? "", endsAt: code.endsAt?.toISOString().slice(0, 10) ?? "", active: code.active }
              : null
          }
          categories={cats.map((c) => ({ id: c.id, name: c.name, count: c.productCount }))}
          products={products.map((p) => ({ id: p.id, name: p.name }))}
          currency={siteShop(site).currency}
        />
      </div>
    </>
  );
}
