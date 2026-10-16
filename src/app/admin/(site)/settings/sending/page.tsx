import { requireSiteAccess } from "@/modules/auth/access";
import { businessOf, readSending, senderFor } from "@/modules/sites/business";
import { env } from "@/lib/env";
import { PageHeader } from "../../../ui";
import { SendingForm } from "./sending-form";
import { SendingDomainCard } from "./sending-domain";
import { sendingDomainStatus } from "@/modules/sites/sending-domain";

export const dynamic = "force-dynamic";

/** Settings · Sending, as in design/admin.html: how the site's emails read, and sending from the client's own domain. */
export default async function SendingPage() {
  const { site, role, user } = await requireSiteAccess();
  const own = await sendingDomainStatus({ actorId: user.id, siteId: site.id });
  const b = businessOf(site);
  const address = (env().EMAIL_FROM ?? "").match(/<([^>]+)>/)?.[1] ?? env().EMAIL_FROM ?? "";
  return (
    <>
      <PageHeader title="Sending" back="/settings" />
      <div className="max-w-[640px] pt-5 md:pt-6">
        <SendingForm initial={readSending(site.messages)} fallbackName={b.tradingName || site.name} fallbackReply={b.email} address={senderFor(site).fromAddress ?? address} own={own.setUp?.status === "verified"} now={senderFor(site)} canEdit={role === "owner"} />
        <SendingDomainCard view={own} suggested={site.domain ?? ""} canEdit={role === "owner"} />
      </div>
    </>
  );
}
