import { requireSiteAccess } from "@/modules/auth/access";
import { siteShop } from "@/modules/sites/server";
import { tradingName } from "@/modules/sites/business";
import { getOrder, trackingUrl, type Tracking } from "@/modules/orders/admin";
import { orderVars } from "@/modules/orders/emails";
import { readMessages, templateFor } from "@/modules/sites/messages";
import type { Address, OrderItem } from "@/modules/orders/server";
import { mediaUrl } from "@/modules/media/server";
import { countryName } from "@/lib/countries";
import { formatPrice, type Currency } from "@/modules/sites/shop";
import { ORDER_STATUSES, type OrderStatus } from "@/db/schema";
import { Label, PageHeader, Row, Rows } from "../../../ui";
import { LocalTime } from "../../local-time";
import { StatusPill } from "../status-pill";
import { CopyAddress, MoveOrder, RefundOrder } from "./order-actions";
import { markAs, priceInput, statusNames } from "@/modules/sites/shop";

export const dynamic = "force-dynamic";

/**
 * One order, as in design/admin.html: what was paid and when, the
 * pieces, the customer (email or call), where it goes, tracking, the
 * money broken down with the tax, and the button that moves it along.
 */
export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, site, role } = await requireSiteAccess();
  const names = statusNames(siteShop(site));
  const o = await getOrder({ actorId: user.id, siteId: site.id, orderId: id });
  const cur = o.currency as Currency;
  const items = o.items as OrderItem[];
  const addr = o.address as Partial<Address>;
  const addressLines = addr.line1 ? [o.name, addr.line1, addr.line2, [addr.city, addr.state, addr.postcode].filter(Boolean).join(" "), addr.country ? countryName(addr.country) : ""].filter(Boolean) as string[] : [];
  const tracking = o.tracking as Partial<Tracking>;
  const track = trackingUrl(tracking);
  // Never "new": an order only moves forward from it.
  const next = ORDER_STATUSES[ORDER_STATUSES.indexOf(o.status) + 1] as Exclude<OrderStatus, "new"> | undefined;
  const included = o.total === o.subtotal - o.discount + o.shippingPrice;
  const ship = o.shipping as { name?: string; kind?: string; estimate?: string } | null;
  return (
    <>
      <PageHeader title={`Order ${o.number}`} back="/orders" />
      <div className="max-w-[640px] space-y-6 pt-5 md:pt-6">
        <div>
          <p className="font-mono text-[30px] leading-none">{formatPrice(o.total, cur)}</p>
          <p className="mt-2 flex flex-wrap items-center gap-2 text-[13px] text-muted">
            <span>
              Paid <LocalTime iso={(o.paidAt ?? o.createdAt).toISOString()} /> · Order {o.number}
            </span>
            <StatusPill status={o.status} label={names[o.status]} refunded={o.paymentStatus === "refunded"} partly={o.paymentStatus === "paid" && o.refunded > 0} />
          </p>
        </div>

        <ul className="divide-y divide-line-soft rounded-card border border-line bg-surface">
          {items.map((it) => (
            <li key={it.productId} className="flex gap-3 p-[14px]">
              {it.photo ? (
                // eslint-disable-next-line @next/next/no-img-element -- served straight from the bucket
                <img src={mediaUrl(it.photo)} alt="" className="h-14 w-14 flex-none rounded object-cover" />
              ) : (
                <span className="h-14 w-14 flex-none rounded bg-sunken" />
              )}
              <span className="min-w-0 flex-1">
                <span className="block text-[14.5px] font-medium">{it.name}</span>
                <span className="block text-[12.5px] text-muted">{it.note}</span>
              </span>
              <span className="flex-none text-right font-mono text-[13.5px]">
                {formatPrice(it.unit * it.qty, cur)}
                {it.qty > 1 && <span className="block text-[11.5px] text-muted">{it.qty} × {formatPrice(it.unit, cur)}</span>}
              </span>
            </li>
          ))}
        </ul>

        {o.note && (
          <div>
            <Label>Their note</Label>
            <p className="whitespace-pre-line rounded-card border border-line bg-surface p-4 text-[14px]">{o.note}</p>
          </div>
        )}

        <div>
          <Label>Customer</Label>
          <div className="rounded-card border border-line bg-surface p-4">
            <p className="text-[15px] font-medium">{o.name}</p>
            <p className="mt-0.5 text-[13px] text-muted">
              {o.email}
              {o.phone && ` · ${o.phone}`}
            </p>
            <div className="mt-3 flex gap-2">
              <a href={`mailto:${o.email}?subject=${encodeURIComponent(`Your order ${o.number}`)}`} className="rounded-button border border-line px-3.5 py-2 text-[13.5px] hover:bg-hover">
                Email
              </a>
              {o.phone && (
                <a href={`tel:${o.phone.replace(/\s+/g, "")}`} className="rounded-button border border-line px-3.5 py-2 text-[13.5px] hover:bg-hover">
                  Call
                </a>
              )}
            </div>
          </div>
        </div>

        {ship?.kind === "pickup" && (
          <div>
            <Label>Delivery</Label>
            <p data-testid="deliver-to" className="rounded-card border border-line bg-surface p-4 text-[14px]">
              Picking up — {ship.name}
            </p>
          </div>
        )}
        {addressLines.length > 0 && (
          <div>
            <Label>Deliver to</Label>
            <div className="rounded-card border border-line bg-surface p-4">
              <p data-testid="deliver-to" className="whitespace-pre-line text-[14px] leading-[1.5]">
                {addressLines.join("\n")}
              </p>
              <CopyAddress text={addressLines.join("\n")} />
            </div>
          </div>
        )}

        {tracking.number && (
          <div>
            <Label>Tracking</Label>
            <div className="rounded-card border border-line bg-surface p-4">
              <p className="text-[14px]">{tracking.carrier || "Tracking number"}</p>
              <p className="font-mono text-[13.5px] text-body">{tracking.number}</p>
              {track && (
                <a href={track} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-[13.5px] text-accent-text underline underline-offset-4">
                  Track this parcel
                </a>
              )}
            </div>
          </div>
        )}

        <div>
          <Label>Payment</Label>
          <Rows variant="static">
            <Row title={items.length === 1 ? "Item" : "Items"} right={<span className="font-mono text-[13.5px]">{formatPrice(o.subtotal, cur)}</span>} />
            {o.discount > 0 && <Row title={`Code ${o.discountCode}`} right={<span className="font-mono text-[13.5px]">−{formatPrice(o.discount, cur)}</span>} />}
            {o.tax > 0 && <Row title={included ? `Includes ${o.taxName} ${o.taxRate}%` : `${o.taxName} ${o.taxRate}%`} right={<span className="font-mono text-[13.5px]">{formatPrice(o.tax, cur)}</span>} />}
            <Row title={ship?.name ? `Delivery · ${ship.name}` : "Delivery"} right={<span className="font-mono text-[13.5px]">{o.shippingPrice ? formatPrice(o.shippingPrice, cur) : ship ? "Free" : "—"}</span>} />
            <Row title="Total paid" right={<span className="font-mono text-[14px] font-medium">{formatPrice(o.total, cur)}</span>} />
            {o.refunded > 0 && <Row title="Refunded" right={<span data-testid="refunded" className="font-mono text-[13.5px] text-alert">−{formatPrice(o.refunded, cur)}</span>} />}
          </Rows>
          <p className="mt-2 text-[12.5px] text-muted">{o.provider === "stripe" ? "Paid by card · Stripe." : "Test payment — no real money moved."}</p>
        </div>

        {role === "owner" && o.refunded < o.total && (
          <RefundOrder orderId={o.id} left={priceInput(o.total - o.refunded)} leftLabel={formatPrice(o.total - o.refunded, cur)} full={o.refunded === 0} draft={{ subject: `Your refund for order ${o.number}`, message: `Hi ${o.name.split(" ")[0]},\n\nI've refunded ${formatPrice(o.total - o.refunded, cur)} for order ${o.number}. It goes back to the card you paid with and usually shows within 5–10 business days.\n\n${tradingName(site)}` }} currency={cur} />
        )}
        {next && <MoveOrder orderId={o.id} next={next} label={markAs(names[next])} template={templateFor(readMessages(site.messages), next)} vars={orderVars(o, tradingName(site))} tracking={{ carrier: tracking.carrier ?? "", number: tracking.number ?? "" }} />}
      </div>
    </>
  );
}
