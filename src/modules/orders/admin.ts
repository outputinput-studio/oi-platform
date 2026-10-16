import { and, count, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { withSite } from "@/db/client";
import { ORDER_STATUSES, orders, sites, type Order, type OrderStatus } from "@/db/schema";
import { sendEmail } from "@/lib/email";
import { AccessError, assertAccess } from "@/modules/auth/access";
import { adjustStock, type OrderItem } from "./server";
import { siteStripe } from "@/modules/payments/server";
import { formatPrice, type Currency } from "@/modules/sites/shop";
import { senderFor, tradingName } from "@/modules/sites/business";
import { DEFAULT_TEMPLATES, TEMPLATE_KEYS, customerMail, readMessages, templateFor } from "@/modules/sites/messages";
import { draftFrom, orderVars, trackingText, trackingUrl } from "./emails";
import { FieldError } from "@/lib/form-error";

/**
 * Orders for the team: the queue (New → In progress → Sent → Done), one
 * order in full, and moving it along — optionally emailing the customer
 * as it moves. Only paid (or refunded) orders are the team's business;
 * a checkout someone walked away from never shows here.
 */

const VISIBLE = ["paid", "refunded"] as const;


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
      .set({
        status: c.status,
        ...(c.tracking ? { tracking: c.tracking } : {}),
        // When it first reached this stage, for the customer's timeline (Track my order, their account).
        statusTimes: c.status in (cur.statusTimes ?? {}) ? cur.statusTimes : { ...(cur.statusTimes ?? {}), [c.status]: new Date().toISOString() },
        updatedAt: new Date(),
      })
      .where(eq(orders.id, cur.id))
      .returning(),
  );
  if (c.email) await sendEmail({ to: updated.email, subject: c.email.subject, text: c.email.message, ...customerMail(await siteFor(p.siteId)) });
  return updated;
}

/**
 * The email that goes with a move, from the site's own wording (Settings ·
 * Customer emails), ready for the team to edit before it's sent.
 */
export function draftEmail(o: Order, status: OrderStatus, site: SiteLike, tracking?: Tracking): { subject: string; message: string } {
  if (status === "new") return { subject: `Order ${o.number}`, message: "" };
  return draftFrom(templateFor(readMessages(site.messages), status), { ...orderVars(o, tradingName(site)), tracking: trackingText(tracking) });
}

export { trackingUrl };

/**
 * "Send me a test" on Settings · Customer emails: the wording as it stands
 * in the editor (saved or not), filled in with a sample order, to the
 * person asking — never to anyone else.
 */
export async function sendTemplateTest(p: { actorId: string; siteId: string; to: string; key: unknown; template: unknown }): Promise<{ delivered: boolean }> {
  await assertAccess(p.actorId, p.siteId);
  const key = z.enum(TEMPLATE_KEYS).parse(p.key);
  const t = z.object({ subject: z.string().trim().max(200), body: z.string().trim().max(5000) }).parse(p.template);
  const site = await siteFor(p.siteId);
  const vars = {
    ...orderVars({ name: "Sam Sample", number: 1001, items: [{ name: "Sample product" }] }, tradingName(site)),
    tracking: trackingText({ carrier: "Australia Post", number: "33ANJ482019" }),
    receipt: "1 × Sample product — $120\nTotal — $120",
  };
  const d = draftFrom({ subject: t.subject || DEFAULT_TEMPLATES[key].subject, body: t.body || DEFAULT_TEMPLATES[key].body }, vars);
  return sendEmail({ to: p.to, subject: `Test: ${d.subject}`, text: d.message, ...senderFor(site) });
}

/** The site's row, for how its emails are sent (Settings · Sending). */
type SiteLike = { name: string; business: unknown; messages: unknown; search?: unknown };

async function siteFor(siteId: string): Promise<SiteLike> {
  const [s] = await withSite(siteId, (tx) => tx.select({ name: sites.name, business: sites.business, messages: sites.messages, search: sites.search }).from(sites).limit(1));
  return s ?? { name: "", business: {}, messages: {}, search: {} };
}

// ───────────────────────── refunds ─────────────────────────

const refundSchema = z.object({
  /** Cents; empty means everything not refunded yet. */
  amount: z.number().int().min(1, "How much should go back?").nullable().default(null),
  restock: z.boolean().default(false),
  email: z
    .object({
      subject: z.string().trim().min(1, "The email needs a subject.").max(200),
      message: z.string().trim().min(1, "The email needs a message.").max(5000),
    })
    .optional(),
});

/** Send money back through the site's own Stripe (or just record it, for a test payment). */
export type Refunder = (o: Order, amount: number) => Promise<void>;

async function stripeRefund(siteId: string, o: Order, amount: number): Promise<void> {
  const [site] = await withSite(siteId, (tx) => tx.select().from(sites).limit(1));
  const stripe = siteStripe(site);
  const session = await stripe.checkout.sessions.retrieve(o.providerRef);
  const pi = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;
  if (!pi) throw new Error("Stripe has no payment for this order to refund.");
  await stripe.refunds.create({ payment_intent: pi, amount, metadata: { orderId: o.id, number: String(o.number) } });
}

/**
 * Refund all or part of an order. Owners only: it moves money. The money
 * goes back first; only then does the order change, so a refused refund
 * leaves everything as it was. Optionally puts the stock back and emails
 * the customer.
 */
export async function refundOrder(p: { actorId: string; siteId: string; orderId: string; refund: unknown; refunder?: Refunder }): Promise<Order> {
  await assertAccess(p.actorId, p.siteId, "owner");
  const r = refundSchema.parse(p.refund);
  const o = await getOrder(p);
  const left = o.total - o.refunded;
  if (left <= 0) throw new Error("This order has already been refunded in full.");
  const amount = r.amount ?? left;
  if (amount > left) throw new FieldError("amount", `At most ${formatPrice(left, o.currency as Currency)} can go back.`);

  if (o.provider === "stripe") await (p.refunder ?? ((ord, a) => stripeRefund(p.siteId, ord, a)))(o, amount);

  const updated = await withSite(p.siteId, async (tx) => {
    if (r.restock) {
      for (const it of o.items as OrderItem[]) await adjustStock(tx, it, 1);
    }
    const refunded = o.refunded + amount;
    const [row] = await tx
      .update(orders)
      .set({ refunded, paymentStatus: refunded >= o.total ? "refunded" : "paid", updatedAt: new Date() })
      .where(eq(orders.id, o.id))
      .returning();
    return row;
  });
  if (r.email) await sendEmail({ to: o.email, subject: r.email.subject, text: r.email.message, ...customerMail(await siteFor(p.siteId)) }).catch((err) => console.error("refund email failed", err));
  return updated;
}
