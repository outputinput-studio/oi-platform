import { requireSiteAccess } from "@/modules/auth/access";
import { customerCount } from "@/modules/customers/admin";
import { readAccountSettings } from "@/modules/customers/settings";
import { PageHeader } from "../../../ui";
import { AccountsForm } from "./accounts-form";

export const dynamic = "force-dynamic";

/** Settings · Customer accounts (design/admin.html): accounts on or off, passwords allowed or not. Owners and managers change it. */
export default async function AccountsSettingsPage() {
  const { site, user } = await requireSiteAccess("manager");
  return (
    <>
      <PageHeader title="Customer accounts" back="/settings" />
      <div className="max-w-[640px] pt-5 md:pt-6">
        <AccountsForm initial={readAccountSettings(site.accounts)} canEdit customers={await customerCount({ actorId: user.id, siteId: site.id })} />
      </div>
    </>
  );
}
