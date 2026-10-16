import Link from "next/link";
import { requireSiteAccess } from "@/modules/auth/access";
import { listOrders, orderCounts } from "@/modules/orders/admin";
import { siteShop } from "@/modules/sites/server";
import { statusNames } from "@/modules/sites/shop";
import type { OrderItem } from "@/modules/orders/server";
import { ORDER_STATUSES, type OrderStatus } from "@/db/schema";
import { formatPrice, type Currency } from "@/modules/sites/shop";
import { Card, Chips, PageHeader } from "../../ui";
import { LocalTime } from "../local-time";
import { StatusPill } from "./status-pill";

export const dynamic = "force-dynamic";

/**
 * Orders, as in design/admin.html: how many new ones need confirming,
 * chips by stage, then each order with who, what, how much and when.
 * Newest first.
 */
export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status: raw } = await searchParams;
  const status = (ORDER_STATUSES as readonly string[]).includes(raw ?? "") ? (raw as OrderStatus) : undefined;
  const { user, site } = await requireSiteAccess();
  const names = statusNames(siteShop(site));
  const [list, counts] = await Promise.all([listOrders({ actorId: user.id, siteId: site.id, status }), orderCounts({ actorId: user.id, siteId: site.id })]);
  return (
    <>
      <PageHeader title="Orders" back="/" />
      <div className="pt-4 md:pt-5">
        {counts.new > 0 && (
          <Link href="/orders?status=new" data-testid="new-orders" className="mb-4 block rounded-card border border-accent bg-selected px-4 py-3 text-[14px] font-medium">
            {counts.new} new order{counts.new === 1 ? "" : "s"} need{counts.new === 1 ? "s" : ""} confirming
          </Link>
        )}
        <Chips
          ariaLabel="Order stages"
          current={status ? `/orders?status=${status}` : "/orders"}
          items={[{ href: "/orders", label: "All", count: counts.all }, ...ORDER_STATUSES.map((s) => ({ href: `/orders?status=${s}`, label: names[s], count: counts[s] }))]}
        />
        {list.length === 0 ? (
          <Card className="mt-5 px-5 py-8 text-center">
            {counts.all === 0 ? (
              <>
                <p className="text-[15px] font-medium">Orders land here</p>
                <p className="mt-1 text-[13px] text-muted">When someone buys from your site the order arrives here, and you get an email about it.</p>
              </>
            ) : (
              <>
                <p className="text-[15px] font-medium">Nothing {status ? names[status].toLowerCase() : ""} yet</p>
                <p className="mt-1 text-[13px] text-muted">
                  No orders have reached this stage.{" "}
                  <Link href="/orders" className="text-accent-text underline underline-offset-4">
                    Show all orders
                  </Link>
                </p>
              </>
            )}
          </Card>
        ) : (
          <ul className="mt-5 space-y-2.5">
            {list.map((o) => {
              const items = o.items as OrderItem[];
              const what = items.length === 1 ? items[0].name : `${items[0]?.name ?? "Order"} and ${items.length - 1} more`;
              return (
                <li key={o.id}>
                  <Link href={`/orders/${o.id}`} data-testid={`order-${o.number}`} className="block">
                    <Card className="p-[14px] hover:bg-hover">
                      <span className="flex items-center justify-between gap-3">
                        <span className="flex min-w-0 items-center gap-2">
                          <span className="truncate text-[15px] font-medium">{o.name}</span>
                          <StatusPill status={o.status} label={names[o.status]} refunded={o.paymentStatus === "refunded"} partly={o.paymentStatus === "paid" && o.refunded > 0} />
                        </span>
                        <span className="flex-none font-mono text-[14px]">{formatPrice(o.total, o.currency as Currency)}</span>
                      </span>
                      <span className="mt-1 block truncate text-[13px] text-body">{what}</span>
                      <span className="mt-1 block font-mono text-[12px] text-muted">
                        {o.number} · <LocalTime iso={(o.paidAt ?? o.createdAt).toISOString()} />
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
