import { requireSiteAccess } from "@/modules/auth/access";
import { siteShop } from "@/modules/sites/server";
import { PageHeader } from "../../../ui";
import { ShopForm } from "./shop-form";

export const dynamic = "force-dynamic";

/** Settings · Tax and currency: what prices are in and whether they include tax. Owners and managers change it. */
export default async function ShopSettingsPage() {
  const { site } = await requireSiteAccess("manager");
  return (
    <>
      <PageHeader title="Tax and currency" back="/settings" />
      <div className="max-w-[640px] pt-5 md:pt-6">
        <ShopForm initial={siteShop(site)} canEdit />
      </div>
    </>
  );
}
