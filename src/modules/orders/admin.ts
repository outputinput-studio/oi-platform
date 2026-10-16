import { and, count, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { withSite } from "@/db/client";
import { ORDER_STATUSES, orders, sites, type Order, type OrderStatus } from "@/db/schema";
import { sendEmail } from "@/lib/email";
import { AccessError, assertAccess } from "@/modules/auth/access";
import type { OrderItem } from "./server";

/**
 * Orders for the team: the queue (New → In progress → Sent → Done), one
 * order in full, and moving it along — optionally emailing the customer
 * as it moves. Only paid (or refunded) orders are the team's business;
 * a checkout someone walked away from never shows here.
 */

const VISIBLE = ["paid", "refunded"] as const;

export const STATUS_LABEL: Record<OrderStatus, string> = { new: "New", inProgress: "In progress", sent: "Sent", done: "Done" };

export async function listOrders(p: { actorId: string; siteId: string; status?: OrderStatus }): Promise<Order[]> {
  await assertAccess(p.actorId, p.siteId);
  return withSite(p.siteId, (tx) =>
    tx
      .select()
      .from(orders)
      .where(and(inArray(orders.paymentStatus, [...VISIBLE]), p.status ? eq(orders.status, p.status) : undefined))
      .orderBy(desc(orders.paidAt), desc(orders.createdAt))
      .limit(500),
  );
}

export async function orderCounts(p: { actorId: string; siteId: string }): Promise<Record<OrderStatus | "all", number>> {
  await assertAccess(p.actorId, p.siteId);
  const rows = await withSite(p.siteId, (tx) =>
    tx
      .select({ status: orders.status, n: count() })
      .from(orders)
      .where(inArray(orders.paymentStatus, [...VISIBLE]))
      .groupBy(orders.status),
  );
  const out = { all: 0, new: 0, inProgress: 0, sent: 0, done: 0 };
  for (const r of rows) {
    out[r.status] = Number(r.n);
    out.all += Number(r.n);
  }
  return out;
}

/** For the nav badge: paid orders nobody has started on. No actor: the layout has already checked access. */
export async function newOrderCount(p: { siteId: string }): Promise<number> {
  const [r] = await withSite(p.siteId, (tx) =>
    tx
      .select({ n: count() })
      .from(orders)
      .where(and(eq(orders.paymentStatus, "paid"), eq(orders.status, "new"))),
  );
  return Number(r?.n ?? 0);
}

export async function getOrder(p: { actorId: string; siteId: string; orderId: string }): Promise<Order> {
  await assertAccess(p.actorId, p.siteId);
  if (!z.string().uuid().safeParse(p.orderId).success) throw new AccessError("That order doesn't exist.");
  const [o] = await withSite(p.siteId, (tx) =>
    tx
      .select()
      .from(orders)
      .where(and(eq(orders.id, p.orderId), inArray(orders.paymentStatus, [...VISIBLE])))
      .limit(1),
  );
  if (!o) throw new AccessError("That order doesn't exist.");
  return o;
}

const trackingSchema = z.object({
  carrier: z.string().trim().max(60).default(""),
  number: z.string().trim().max(80).default(""),
});
export type Tracking = z.infer<typeof trackingSchema>;

const moveSchema = z.object({
  status: z.enum(ORDER_STATUSES),
  tracking: trackingSchema.optional(),
  email: z
    .object({
      subject: z.string().trim().min(1, "The email needs a subject.").max(200),
      message: z.string().trim().min(1, "The email needs a message.").max(5000),
    })
    .optional(),
});

/** Move an order along; with `email`, the customer hears about it. */
export async function moveOrder(p: { actorId: string; siteId: string; orderId: string; change: unknown }): Promise<Order> {
  await assertAccess(p.actorId, p.siteId);
  const c = moveSchema.parse(p.change);
  const cur = await getOrder(p);
  const [updated] = await withSite(p.siteId, (tx) =>
    tx
      .update(orders)
      .set({ status: c.status, ...(c.tracking ? { tracking: c.tracking } : {}), updatedAt: new Date() })
      .where(eq(orders.id, cur.id))
      .returning(),
  );
  if (c.email) await sendEmail({ to: updated.email, subject: c.email.subject, text: c.email.message });
  return updated;
}

/** The email that goes with a move, ready for the team to edit before it's sent. */
export function draftEmail(o: Order, status: OrderStatus, siteName: string, tracking?: Tracking): { subject: string; message: string } {
  const first = o.name.split(" ")[0];
  const items = o.items as OrderItem[];
  const what = items.length === 1 ? items[0].name : `order ${o.number}`;
  const sign = `\n\n${siteName}`;
  if (status === "inProgress")
    return { subject: `I've started on your ${what}`, message: `Hi ${first},\n\nJust letting you know I've started on your ${what}. I'll be in touch when it's on its way.${sign}` };
  if (status === "sent") {
    const t = tracking?.number ? `\n\n${tracking.carrier ? `${tracking.carrier} tracking` : "Tracking"}: ${tracking.number}${trackingUrl(tracking) ? `\n${trackingUrl(tracking)}` : ""}` : "";
    return { subject: `Your ${what} is on its way`, message: `Hi ${first},\n\nYour ${what} went out today.${t}${sign}` };
  }
  if (status === "done") return { subject: `Thanks again, ${first}`, message: `Hi ${first},\n\nThanks again for your order. I hope you love it.${sign}` };
  return { subject: `Order ${o.number}`, message: `Hi ${first},${sign}` };
}

/** A link to follow a parcel, for the carriers we know. */
export function trackingUrl(t: Partial<Tracking>): string | null {
  const n = encodeURIComponent((t.number ?? "").trim());
  if (!n) return null;
  const c = (t.carrier ?? "").toLowerCase();
  if (c.includes("australia post") || c === "auspost") return `https://auspost.com.au/mypost/track/details/${n}`;
  if (c.includes("thailand post")) return `https://track.thailandpost.co.th/?trackNumber=${n}`;
  if (c.includes("dhl")) return `https://www.dhl.com/global-en/home/tracking.html?tracking-id=${n}`;
  if (c.includes("fedex")) return `https://www.fedex.com/fedextrack/?trknbr=${n}`;
  if (c.includes("ups")) return `https://www.ups.com/track?tracknum=${n}`;
  if (c.includes("nz post")) return `https://www.nzpost.co.nz/tools/tracking?trackid=${n}`;
  return null;
}

export async function siteNameFor(siteId: string): Promise<string> {
  const [s] = await withSite(siteId, (tx) => tx.select({ name: sites.name }).from(sites).limit(1));
  return s?.name ?? "";
}
