import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { withSite } from "@/db/client";
import { orders } from "@/db/schema";
import { named } from "@/lib/form-error";
import { emailSchema } from "./server";
import { lockedFor, miss } from "./throttle";
import { timeline, type Timeline } from "./timeline";

/**
 * Track my order: an order number and the email on it, no account, no
 * sign-in. It shows where the parcel is and nothing else — not the
 * address, not what's in it — and five misses for one email lock that
 * email's lookups for a while, so numbers can't be run through to find
 * someone's order.
 */

export type Tracked = { number: number; placedAt: string; timeline: Timeline };
export type TrackResult = { found: true; order: Tracked } | { found: false; wait?: number };

const numberSchema = z.coerce.number({ message: "Order numbers are numbers, like 1047." }).int("Order numbers are whole numbers, like 1047.").min(1, "Order numbers are numbers, like 1047.").max(99_999_999, "That's not an order number we'd have.");

export async function trackOrder(p: { siteId: string; number: unknown; email: unknown; now?: Date }): Promise<TrackResult> {
  const number = named("number", numberSchema, typeof p.number === "string" ? p.number.trim().replace(/^#/, "") : p.number);
  const email = named("email", emailSchema, p.email);
  const now = p.now ?? new Date();
  const key = `track:${email}`;
  return withSite(p.siteId, async (tx): Promise<TrackResult> => {
    const locked = await lockedFor(tx, key, now);
    if (locked) return { found: false, wait: locked };
    const [o] = await tx
      .select()
      .from(orders)
      .where(and(eq(orders.number, number), sql`lower(${orders.email}) = ${email}`, inArray(orders.paymentStatus, ["paid", "refunded"])))
      .limit(1);
    if (!o) {
      const wait = await miss(tx, p.siteId, key, now);
      return wait ? { found: false, wait } : { found: false };
    }
    return { found: true, order: { number: o.number, placedAt: (o.paidAt ?? o.createdAt).toISOString(), timeline: timeline(o) } };
  });
}
