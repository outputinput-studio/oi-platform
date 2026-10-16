import { z } from "zod";
import { MAX_ANSWER } from "@/modules/products/options";

/**
 * The cart lives in a cookie on the shop's own address: which products,
 * which combination (Size 8 · Print) and what they filled in, and how
 * many; nothing else. Prices, names and whether something can still be
 * bought are looked up fresh every time, so a cookie can't set its own
 * price.
 */
export const CART_COOKIE = "oi_cart";
/** A random id for this shopper's cart, so stock held for their own unpaid try doesn't block them. */
export const CART_REF_COOKIE = "oi_cart_ref";
export const MAX_LINES = 30;
export const MAX_QTY = 20;

const lineSchema = z.object({
  id: z.string().uuid(),
  q: z.number().int().min(1).max(MAX_QTY),
  /** The combination's key ("8 / Print"), for a product with list options. */
  v: z.string().max(90).optional(),
  /** Fill-in answers, by option id. */
  f: z.record(z.string().max(40), z.string().max(MAX_ANSWER)).optional(),
});
export type CartLine = z.infer<typeof lineSchema>;
/** Cookies stop at 4 KB; a cart that would go past this many characters takes nothing more. */
export const MAX_CART_CHARS = 3600;

/** What makes two lines the same thing: product, combination and answers. */
export function lineKey(l: Pick<CartLine, "id" | "v" | "f">): string {
  const f = l.f ? Object.keys(l.f).sort().map((k) => `${k}=${l.f![k]}`).join("&") : "";
  return `${l.id}~${l.v ?? ""}~${f}`;
}

export function readCart(raw: string | undefined): CartLine[] {
  if (!raw) return [];
  try {
    const parsed = z.array(lineSchema).max(MAX_LINES).safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

export function writeCart(lines: CartLine[]): string {
  return JSON.stringify(lines.slice(0, MAX_LINES));
}

export function addLine(lines: CartLine[], item: string | Omit<CartLine, "q">, q = 1): CartLine[] {
  const add: Omit<CartLine, "q"> = typeof item === "string" ? { id: item } : item;
  const key = lineKey(add);
  const found = lines.find((l) => lineKey(l) === key);
  if (found) return lines.map((l) => (lineKey(l) === key ? { ...l, q: Math.min(MAX_QTY, l.q + q) } : l));
  return [...lines, { ...add, q: Math.min(MAX_QTY, Math.max(1, q)) }].slice(0, MAX_LINES);
}

/** A line's quantity, by its key (see lineKey); 0 takes it out. */
export function setLine(lines: CartLine[], key: string, q: number): CartLine[] {
  if (q <= 0) return lines.filter((l) => lineKey(l) !== key);
  return lines.map((l) => (lineKey(l) === key ? { ...l, q: Math.min(MAX_QTY, q) } : l));
}

export function cartCount(lines: CartLine[]): number {
  return lines.reduce((n, l) => n + l.q, 0);
}

/**
 * Tax on a total. When prices include it, it's worked out of the total
 * (420 incl. 10% → 38.18); when they don't, it's added on top.
 */
export function taxOn(amount: number, rate: number, included: boolean): { tax: number; total: number } {
  if (rate <= 0) return { tax: 0, total: amount };
  if (included) return { tax: Math.round((amount * rate) / (100 + rate)), total: amount };
  const tax = Math.round((amount * rate) / 100);
  return { tax, total: amount + tax };
}
