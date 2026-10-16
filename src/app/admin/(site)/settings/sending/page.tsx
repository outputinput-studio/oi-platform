import { requireSiteAccess } from "@/modules/auth/access";
import { businessOf, readSending, senderFor } from "@/modules/sites/business";
import { env } from "@/lib/env";
import { PageHeader } from "../../../ui";
import { SendingForm } from "./sending-form";

export const dynamic = "force-dynamic";

/** Settings · Sending, as in design/admin.html: how the site's emails read. The own-domain part waits for Settings · Domain. */
export default async function SendingPage() {
  const { site, role } = await requireSiteAccess();
  const b = businessOf(site);
  const address = (env().EMAIL_FROM ?? "").match(/<([^>]+)>/)?.[1] ?? env().EMAIL_FROM ?? "";
  return (
    <>
      <PageHeader title="Sending" back="/settings" />
      <div className="max-w-[640px] pt-5 md:pt-6">
        <SendingForm initial={readSending(site.messages)} fallbackName={b.tradingName || site.name} fallbackReply={b.email} address={address} now={senderFor(site)} canEdit={role === "owner"} />
      </div>
    </>
  );
}
