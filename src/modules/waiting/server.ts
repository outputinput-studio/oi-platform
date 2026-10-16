import { and, count, desc, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { withSite } from "@/db/client";
import { products, sites, waiting, type Product } from "@/db/schema";
import { sendEmail } from "@/lib/email";
import { FieldError, named } from "@/lib/form-error";
import { assertAccess } from "@/modules/auth/access";
import { customerView, effectiveAvailability } from "@/modules/products/catalogue";
import { listOptions, readOptions, readVariants, variantKey, variantLabel, variantsFor, variantState } from "@/modules/products/options";
import { tradingName } from "@/modules/sites/business";
import { customerMail } from "@/modules/sites/messages";
import { readShopSettings } from "@/modules/sites/shop";

/**
 * "Email me when it's back", as in design/admin.html. A shopper leaves an
 * email on a sold-out product (or one combination of it); when the team
 * makes it buyable again, each of them gets one email, and it's marked so
 * nobody hears twice. Nothing goes out before that.
 */

/** A list this long is somebody filling it in for fun; the real ones never get near it. */
export const MAX_WAITING = 1000;

const emailSchema = z.string().trim().toLowerCase().email("That email address doesn't look right.").max(200);

/** What a sold-out product can be waited on for: "" (the product) or the keys of its sold-out combinations. */
function waitable(p: Product): Set<string> {
  const opts = readOptions(p.options);
  if (listOptions(opts).length === 0) return new Set(effectiveAvailability(p) === "soldOut" ? [""] : []);
  // A one-of-a-kind combination that has sold isn't coming back; one that's sold out (counted stock) is.
  if (p.availability !== "forSale") return new Set();
  return new Set(variantsFor(opts, readVariants(p.variants), p.make).filter((v) => variantState(v) === "soldOut").map((v) => variantKey(v.values)));
}

/** What can be bought now: "" for the product, or its combinations' keys. Empty when nothing can. */
function buyable(p: Product, currency: Parameters<typeof customerView>[1]): Set<string> {
  const view = customerView(p, currency);
  if (effectiveAvailability(p) !== "forSale" || !(view.buyable || view.quotable)) return new Set();
  const opts = readOptions(p.options);
  if (listOptions(opts).length === 0) return new Set([""]);
  return new Set(variantsFor(opts, readVariants(p.variants), p.make).filter((v) => variantState(v) === "available").map((v) => variantKey(v.values)));
}

/** A shopper asks to hear when it's back. Asking twice is fine: still one email. */
export async function joinWaiting(p: { siteId: string; productId: string; variant?: string; email: unknown }): Promise<{ ok: string }> {
  const email = named("email", emailSchema, p.email);
  const productId = z.string().uuid().parse(p.productId);
  const variant = z.string().max(90).parse(p.variant ?? "");
  return withSite(p.siteId, async (tx) => {
    const [prod] = await tx
      .select()
      .from(products)
      .where(and(eq(products.id, productId), eq(products.visible, true), isNull(products.deletedAt)))
      .limit(1);
    if (!prod) throw new Error("This product isn't on the shop any more.");
    if (!waitable(prod).has(variant)) throw new Error("It's not sold out — you can buy it now.");
    const [{ n }] = await tx
      .select({ n: count() })
      .from(waiting)
      .where(and(eq(waiting.productId, productId), isNull(waiting.notifiedAt)));
    if (n >= MAX_WAITING) throw new FieldError("email", "The list for this one is full. Get in touch and we'll let you know ourselves.");
    await tx.insert(waiting).values({ siteId: p.siteId, productId, variant, email }).onConflictDoNothing();
    return { ok: `Done. We'll email ${email} when it's back — just the once.` };
  });
}

export type Waiter = { email: string; variant: string; createdAt: Date };

/** Who's waiting on a product, newest first, for its page in the admin. */
export async function listWaiting(p: { actorId: string; siteId: string; productId: string }): Promise<Waiter[]> {
  await assertAccess(p.actorId, p.siteId);
  if (!z.string().uuid().safeParse(p.productId).success) return [];
  return withSite(p.siteId, (tx) =>
    tx
      .select({ email: waiting.email, variant: waiting.variant, createdAt: waiting.createdAt })
      .from(waiting)
      .where(and(eq(waiting.productId, p.productId), isNull(waiting.notifiedAt)))
      .orderBy(desc(waiting.createdAt)),
  );
}

/** How many are waiting on each product, for the products list. */
export async function waitingCounts(p: { actorId: string; siteId: string }): Promise<Map<string, number>> {
  await assertAccess(p.actorId, p.siteId);
  const rows = await withSite(p.siteId, (tx) => tx.select({ productId: waiting.productId, n: count() }).from(waiting).where(isNull(waiting.notifiedAt)).groupBy(waiting.productId));
  return new Map(rows.map((r) => [r.productId, Number(r.n)]));
}

/**
 * After the team saves a product: everyone waiting on something that can
 * be bought again is marked as told (first, so a second save can't send it
 * twice), then emailed. `shopOrigin` is the storefront's address for the
 * link. Returns how many were told.
 */
export async function notifyBackInStock(p: { siteId: string; productId: string; shopOrigin: string }): Promise<number> {
  const found = await withSite(p.siteId, async (tx) => {
    const [prod] = await tx
      .select()
      .from(products)
      .where(and(eq(products.id, p.productId), eq(products.visible, true), isNull(products.deletedAt)))
      .limit(1);
    if (!prod) return null;
    const [site] = await tx.select().from(sites).limit(1);
    const back = [...buyable(prod, readShopSettings(site.shop).currency)];
    if (back.length === 0) return null;
    const told = await tx
      .update(waiting)
      .set({ notifiedAt: new Date() })
      .where(and(eq(waiting.productId, prod.id), isNull(waiting.notifiedAt), inArray(waiting.variant, back)))
      .returning({ email: waiting.email, variant: waiting.variant });
    return { prod, site, told };
  });
  if (!found) return 0;
  const { prod, site, told } = found;
  const name = tradingName(site);
  for (const t of told) {
    const what = t.variant ? `${prod.name} (${variantLabel(t.variant.split(" / "))})` : prod.name;
    await sendEmail({
      to: t.email,
      subject: `${what} is back`,
      text: `Good news: ${what} is back at ${name}.\n\n${p.shopOrigin}/shop/${prod.slug}\n\nYou asked us to let you know, so this is the one email you'll get about it.`,
      ...customerMail(site),
    }).catch((err) => console.error("back in stock email failed", err));
  }
  return told.length;
}
