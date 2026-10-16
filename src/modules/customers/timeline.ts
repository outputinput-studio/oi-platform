import type { Order } from "@/db/schema";
import { trackingUrl } from "@/modules/orders/emails";

/**
 * Where an order is, in the customer's words — the same on the tracking
 * page and in their account. The team's own stage names ("With Michelle")
 * stay in the admin; customers see placed → getting it ready → posted →
 * delivered (or ready to collect → collected for a pickup), each with when
 * it happened.
 */

export type TimelineStep = { key: string; label: string; done: boolean; at?: string; detail?: string };
export type Timeline = {
  headline: string;
  steps: TimelineStep[];
  tracking: { carrier: string; number: string; url: string | null } | null;
};

type OrderLike = Pick<Order, "status" | "paymentStatus" | "createdAt" | "paidAt" | "statusTimes" | "shipping" | "tracking" | "items" | "refunded" | "total">;

const RANK = { new: 0, inProgress: 1, sent: 2, done: 3 } as const;

export function orderKind(o: Pick<Order, "shipping" | "items">): "post" | "pickup" | "digital" {
  const ship = o.shipping as { kind?: string } | null;
  if (ship?.kind === "pickup") return "pickup";
  if (!ship && (o.items as { digital?: boolean }[]).every((i) => i.digital)) return "digital";
  return "post";
}

export function timeline(o: OrderLike): Timeline {
  const kind = orderKind(o);
  const rank = RANK[o.status];
  const times = (o.statusTimes ?? {}) as Record<string, string>;
  const ship = o.shipping as { name?: string; estimate?: string } | null;
  const t = o.tracking as { carrier?: string; number?: string };
  const tracking = t?.number?.trim() ? { carrier: t.carrier?.trim() ?? "", number: t.number.trim(), url: trackingUrl({ carrier: t.carrier ?? "", number: t.number }) } : null;
  const placed: TimelineStep = { key: "new", label: "Order placed", done: true, at: (o.paidAt ?? o.createdAt).toISOString() };
  const ready: TimelineStep = { key: "inProgress", label: "Getting it ready", done: rank >= 1, at: times.inProgress };

  let steps: TimelineStep[];
  if (kind === "digital") {
    steps = [placed, { key: "done", label: "Ready for you", done: rank >= 2, at: times.done ?? times.sent }];
  } else if (kind === "pickup") {
    steps = [placed, ready, { key: "sent", label: "Ready to collect", done: rank >= 2, at: times.sent }, { key: "done", label: "Collected", done: rank >= 3, at: times.done }];
  } else {
    const carrier = tracking?.carrier || "";
    steps = [
      placed,
      ready,
      { key: "sent", label: "Posted", done: rank >= 2, at: times.sent, detail: rank >= 2 && carrier ? carrier : undefined },
      { key: "done", label: "Delivered", done: rank >= 3, at: times.done, detail: rank < 3 && ship?.estimate ? `Expected ${ship.estimate}` : undefined },
    ];
  }

  const refunded = o.paymentStatus === "refunded" || (o.refunded > 0 && o.refunded >= o.total);
  const headline = refunded
    ? "Refunded"
    : {
        post: ["We've got your order", "Getting it ready", "On its way to you", "Delivered"],
        pickup: ["We've got your order", "Getting it ready", "Ready to collect", "Collected"],
        digital: ["We've got your order", "Getting it ready", "Ready for you", "Ready for you"],
      }[kind][rank];
  return { headline, steps, tracking };
}

/** One line for a list of orders: "On its way · 28 Aug". */
export function orderLine(o: OrderLike): string {
  const { headline } = timeline(o);
  const short = headline === "On its way to you" ? "On its way" : headline === "We've got your order" ? "Order placed" : headline;
  return short;
}
