import { and, asc, count, eq, isNull, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { withSite, type Tx } from "@/db/client";
import { discountCodes, orders, type DiscountCode } from "@/db/schema";
import { AccessError, assertAccess } from "@/modules/auth/access";
import type { Currency } from "@/modules/sites/shop";
import { applyCode, codeEditSchema, codeTextSchema, type Applied, type Line } from "./rules";

/** Discount codes for the team, and the checkout's way of looking one up. */

export async function listCodes(p: { actorId: string; siteId: string }): Promise<DiscountCode[]> {
  await assertAccess(p.actorId, p.siteId);
  return withSite(p.siteId, (tx) => tx.select().from(discountCodes).where(isNull(discountCodes.deletedAt)).orderBy(asc(discountCodes.code)));
}

export async function getCode(p: { actorId: string; siteId: string; codeId: string }): Promise<DiscountCode> {
  await assertAccess(p.actorId, p.siteId);
  return withSite(p.siteId, (tx) => load(tx, p.codeId));
}

export async function saveCode(p: { actorId: string; siteId: string; codeId?: string; edit: unknown }): Promise<DiscountCode> {
  await assertAccess(p.actorId, p.siteId);
  const e = codeEditSchema.parse(p.edit);
  return withSite(p.siteId, async (tx) => {
    const [clash] = await tx
      .select({ id: discountCodes.id })
      .from(discountCodes)
      .where(and(eq(discountCodes.code, e.code), isNull(discountCodes.deletedAt), p.codeId ? ne(discountCodes.id, p.codeId) : undefined))
      .limit(1);
    if (clash) throw new AccessError(`There's already a code ${e.code}.`);
    const values = { ...e, value: e.kind === "freeShipping" ? 0 : e.value };
    if (p.codeId) {
      const cur = await load(tx, p.codeId);
      const [row] = await tx.update(discountCodes).set(values).where(eq(discountCodes.id, cur.id)).returning();
      return row;
    }
    const [row] = await tx
      .insert(discountCodes)
      .values({ siteId: p.siteId, ...values })
      .returning();
    return row;
  });
}

export async function deleteCode(p: { actorId: string; siteId: string; codeId: string }): Promise<void> {
  await assertAccess(p.actorId, p.siteId);
  await withSite(p.siteId, async (tx) => {
    const cur = await load(tx, p.codeId);
    await tx.update(discountCodes).set({ deletedAt: new Date() }).where(eq(discountCodes.id, cur.id));
  });
}

// ───────────────────────── checkout ─────────────────────────

/**
 * What a typed code does to these lines, for this customer. Unknown codes,
 * codes that aren't running and codes this email has used up all come
 * back with a reason the customer can read.
 */
export async function discountFor(p: { siteId: string; code: string; lines: Line[]; currency: Currency; email?: string }): Promise<Applied & { code?: string }> {
  const parsed = codeTextSchema.safeParse(p.code);
  if (!parsed.success) return { ok: false, reason: "That code doesn't look right." };
  const text = parsed.data;
  return withSite(p.siteId, async (tx) => {
    const [c] = await tx
      .select()
      .from(discountCodes)
      .where(and(eq(discountCodes.code, text), isNull(discountCodes.deletedAt)))
      .limit(1);
    if (!c) return { ok: false, reason: `${text} isn't a code here.` };
    const applied = applyCode(c, p.lines, p.currency);
    if (!applied.ok) return applied;
    if (c.perPerson !== null && p.email) {
      const [used] = await tx
        .select({ n: count() })
        .from(orders)
        .where(and(eq(orders.discountCode, text), eq(orders.email, p.email.toLowerCase()), eq(orders.paymentStatus, "paid")));
      if (Number(used?.n ?? 0) >= c.perPerson) return { ok: false, reason: `You've already used ${text}.` };
    }
    return { ...applied, code: text };
  });
}

/** A paid order used this code: count it. Called inside markOrderPaid's transaction. */
export async function countUse(tx: Tx, code: string): Promise<void> {
  if (!code) return;
  await tx
    .update(discountCodes)
    .set({ uses: sql`${discountCodes.uses} + 1` })
    .where(and(eq(discountCodes.code, code), isNull(discountCodes.deletedAt)));
}

async function load(tx: Tx, id: string): Promise<DiscountCode> {
  if (!z.string().uuid().safeParse(id).success) throw new AccessError("That code doesn't exist.");
  const [c] = await tx
    .select()
    .from(discountCodes)
    .where(and(eq(discountCodes.id, id), isNull(discountCodes.deletedAt)))
    .limit(1);
  if (!c) throw new AccessError("That code doesn't exist.");
  return c;
}
