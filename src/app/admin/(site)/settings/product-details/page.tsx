import { requireSiteAccess } from "@/modules/auth/access";
import { deliveryText } from "@/modules/products/details";
import { detailRowUsage } from "@/modules/products/server";
import { siteShipping, siteShop } from "@/modules/sites/server";
import { PageHeader } from "../../../ui";
import { DetailRowsEditor } from "./detail-rows-editor";

export const dynamic = "force-dynamic";

/** Settings · Product details, as in design/admin.html: the rows every product page opens up. */
export default async function ProductDetailsPage() {
  const { user, site } = await requireSiteAccess("manager");
  const shop = siteShop(site);
  const usage = await detailRowUsage({ actorId: user.id, siteId: site.id });
  return (
    <>
      <PageHeader title="Product details" back="/settings" />
      <div className="max-w-[640px] pt-5 md:pt-6">
        <DetailRowsEditor
          initial={shop.detailRows}
          usage={usage}
          deliveryPreview={deliveryText(siteShipping(site), shop.currency, { digital: false, make: "ready", leadTime: null, leadUnit: "weeks" })}
          canEdit
        />
      </div>
    </>
  );
}
