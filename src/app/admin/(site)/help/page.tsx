import { requireSiteAccess } from "@/modules/auth/access";
import { helpContact, helpSchema } from "@/modules/help/server";
import { PageHeader } from "../../ui";
import { HelpForm } from "./help-form";

export const dynamic = "force-dynamic";

/**
 * Get help (More → Get help), design/admin.html's "Ask us": "Write it how
 * you would say it. We can see which screen you were on, so no need to
 * explain where you are." Everyone on the team can write.
 */
export default async function HelpPage({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  const { site, user } = await requireSiteAccess();
  const raw = (await searchParams).from;
  const from = helpSchema.shape.from.parse(raw && raw !== "/help" ? raw : undefined);
  const contact = helpContact();
  const direct = contact.email || contact.phone;
  return (
    <>
      <PageHeader title="Get help" back="/" />
      <div className="max-w-[560px] space-y-6 pt-5 md:pt-6">
        <div>
          <h2 className="text-[18px] font-semibold">Ask us</h2>
          <p className="mt-1 text-[14px] text-body">Write it how you would say it. We can see which screen you were on, so no need to explain where you are.</p>
        </div>
        <HelpForm from={from} sentWith={[user.name || user.email, site.name, from ? `the ${screenName(from)} screen` : ""].filter(Boolean).join(" · ")} />
        {direct && (
          <div className="border-t border-line pt-5" data-testid="help-direct">
            <p className="label">Or reach us directly</p>
            <div className="mt-2.5 space-y-1.5 text-[15px]">
              {contact.email && (
                <a href={`mailto:${contact.email}`} className="block text-accent-text underline underline-offset-4">
                  {contact.email}
                </a>
              )}
              {contact.phone && (
                <a href={`tel:${contact.phone.replace(/[^\d+]/g, "")}`} className="block text-accent-text underline underline-offset-4">
                  {contact.phone}
                </a>
              )}
            </div>
            {contact.hours && <p className="mt-2 text-[13px] text-muted">{contact.hours}</p>}
          </div>
        )}
      </div>
    </>
  );
}

/** "/settings/plan" → "Settings", "/" → "Home": what to call the screen they came from. */
function screenName(path: string): string {
  const first = path.split(/[/?]/).filter(Boolean)[0];
  return first ? first.charAt(0).toUpperCase() + first.slice(1).replace(/-/g, " ") : "Home";
}
