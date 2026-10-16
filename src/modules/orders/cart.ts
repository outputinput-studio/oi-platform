import { z } from "zod";

/**
 * The cart lives in a cookie on the shop's own address: which products
 * and how many, nothing else. Prices, names and whether something can
 * still be bought are looked up fresh every time, so a cookie can't set
 * its own price.
 */
export const CART_COOKIE = "oi_cart";
/** A random id for this shopper's cart, so stock held for their own unpaid try doesn't block them. */
export const CART_REF_COOKIE = "oi_cart_ref";
export const MAX_LINES = 30;
export const MAX_QTY = 20;

const lineSchema = z.object({ id: z.string().uuid(), q: z.number().int().min(1).max(MAX_QTY) });
export type CartLine = z.infer<typeof lineSchema>;

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

export function addLine(lines: CartLine[], id: string, q = 1): CartLine[] {
  const found = lines.find((l) => l.id === id);
  if (found) return lines.map((l) => (l.id === id ? { ...l, q: Math.min(MAX_QTY, l.q + q) } : l));
  return [...lines, { id, q: Math.min(MAX_QTY, Math.max(1, q)) }].slice(0, MAX_LINES);
}

export function setLine(lines: CartLine[], id: string, q: number): CartLine[] {
  if (q <= 0) return lines.filter((l) => l.id !== id);
  return lines.map((l) => (l.id === id ? { ...l, q: Math.min(MAX_QTY, q) } : l));
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
