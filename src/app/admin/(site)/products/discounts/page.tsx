import Link from "next/link";
import { requireSiteAccess } from "@/modules/auth/access";
import { listCodes } from "@/modules/discounts/server";
import { codeState, describeCode } from "@/modules/discounts/rules";
import { listProductCategories } from "@/modules/products/categories";
import { siteShop } from "@/modules/sites/server";
import { Card, PageHeader, Pill } from "../../../ui";
import { LocalTime } from "../../local-time";

export const dynamic = "force-dynamic";

const STATE = { active: ["Active", "success"], scheduled: ["Scheduled", "warning"], expired: ["Expired", "neutral"], usedUp: ["Used up", "neutral"], off: ["Off", "neutral"] } as const;

/** Discount codes, as in design/admin.html: each with what it does, whether it's running and how often it's been used. */
export default async function DiscountsPage() {
  const { user, site } = await requireSiteAccess();
  const [codes, cats] = await Promise.all([listCodes({ actorId: user.id, siteId: site.id }), listProductCategories({ actorId: user.id, siteId: site.id })]);
  const { currency } = siteShop(site);
  return (
    <>
      <PageHeader
        title="Discount codes"
        back="/products"
        actions={
          <Link href="/products/discounts/new" className="inline-flex h-9 items-center rounded-button bg-accent px-3.5 text-[13.5px] font-medium text-text hover:bg-accent-hover">
            Add code
          </Link>
        }
      />
      <div className="max-w-[640px] pt-5 md:pt-6">
        {codes.length === 0 ? (
          <Card className="px-5 py-8 text-center">
            <p className="text-[15px] font-medium">No codes yet</p>
            <p className="mt-1 text-[13px] text-muted">Make one for a sale, a returning customer, or a competition you are sponsoring.</p>
          </Card>
        ) : (
          <ul className="space-y-2.5">
            {codes.map((c) => {
              const st = codeState(c);
              const [label, tone] = STATE[st];
              return (
                <li key={c.id}>
                  <Link href={`/products/discounts/${c.id}`} data-testid={`code-${c.code}`} className="block">
                    <Card className="p-[14px] hover:bg-hover">
                      <span className="flex items-center justify-between gap-2">
                        <span className="font-mono text-[15px] font-medium">{c.code}</span>
                        <Pill tone={tone}>{label}</Pill>
                      </span>
                      <span className="mt-1 block text-[13px] text-body">{describeCode(c, currency, cats.find((x) => x.id === c.categoryId)?.name.toLowerCase())}</span>
                      <span className="mt-1 block text-[12px] text-muted">
                        {st === "scheduled" && c.startsAt ? (
                          <>
                            Starts <LocalTime iso={c.startsAt.toISOString()} style="date" />
                          </>
                        ) : c.maxUses ? (
                          `${c.uses} of ${c.maxUses} used`
                        ) : (
                          `${c.uses} used`
                        )}
                      </span>
                    </Card>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
}
