import { z } from "zod";
import { DISCOUNT_KINDS, DISCOUNT_SCOPES } from "./kinds";
import { formatPrice, type Currency } from "@/modules/sites/shop";

/**
 * What a discount code does to an order, pure: the admin preview, the
 * checkout preview and the order itself all use this, so they agree.
 */

export type CodeRules = {
  code: string;
  kind: (typeof DISCOUNT_KINDS)[number];
  value: number;
  appliesTo: (typeof DISCOUNT_SCOPES)[number];
  categoryId: string | null;
  productIds: string[];
  minSpend: number | null;
  maxUses: number | null;
  startsAt: Date | null;
  endsAt: Date | null;
  active: boolean;
  uses: number;
};

export type Line = { productId: string; categoryId: string | null; unit: number; qty: number };

export type Applied = { ok: true; off: number; freeShipping: boolean } | { ok: false; reason: string };

/** Whether a code works right now, before looking at the cart. */
export function codeState(c: Pick<CodeRules, "active" | "startsAt" | "endsAt" | "maxUses" | "uses">, now = new Date()): "active" | "off" | "scheduled" | "expired" | "usedUp" {
  if (!c.active) return "off";
  if (c.maxUses !== null && c.uses >= c.maxUses) return "usedUp";
  if (c.endsAt && c.endsAt <= now) return "expired";
  if (c.startsAt && c.startsAt > now) return "scheduled";
  return "active";
}

export function applyCode(c: CodeRules, lines: Line[], currency: Currency, now = new Date()): Applied {
  const state = codeState(c, now);
  if (state === "scheduled") return { ok: false, reason: `${c.code} hasn't started yet.` };
  if (state !== "active") return { ok: false, reason: `${c.code} isn't working any more.` };
  const subtotal = lines.reduce((n, l) => n + l.unit * l.qty, 0);
  if (c.minSpend !== null && subtotal < c.minSpend) return { ok: false, reason: `${c.code} needs a spend of at least ${formatPrice(c.minSpend, currency)} before postage.` };
  const eligible = lines.filter((l) => c.appliesTo === "all" || (c.appliesTo === "category" && l.categoryId !== null && l.categoryId === c.categoryId) || (c.appliesTo === "products" && c.productIds.includes(l.productId)));
  if (eligible.length === 0) return { ok: false, reason: `${c.code} doesn't apply to anything in your cart.` };
  const base = eligible.reduce((n, l) => n + l.unit * l.qty, 0);
  if (c.kind === "freeShipping") return { ok: true, off: 0, freeShipping: true };
  if (c.kind === "percent") return { ok: true, off: Math.round((base * Math.min(100, c.value)) / 100), freeShipping: false };
  return { ok: true, off: Math.min(base, c.value), freeShipping: false };
}

/** "10% off everything", "$50 off, minimum spend $400", "Free postage". */
export function describeCode(c: Pick<CodeRules, "kind" | "value" | "appliesTo" | "minSpend">, currency: Currency, scopeName = ""): string {
  const what = c.kind === "percent" ? `${c.value}% off` : c.kind === "amount" ? `${formatPrice(c.value, currency)} off` : "Free postage";
  const scope = c.kind === "freeShipping" ? "" : c.appliesTo === "all" ? " everything" : c.appliesTo === "category" ? ` ${scopeName || "one category"}` : " picked products";
  const min = c.minSpend ? `, minimum spend ${formatPrice(c.minSpend, currency)}` : "";
  return `${what}${scope}${min}`;
}

export const codeTextSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9-]{3,30}$/, "3 to 30 letters, numbers or dashes, like WELCOME10.");

const cents = z.number().int().min(0).max(100_000_000);

export const codeEditSchema = z
  .object({
    code: codeTextSchema,
    kind: z.enum(DISCOUNT_KINDS),
    value: z.number().int().min(0).max(100_000_000).default(0),
    appliesTo: z.enum(DISCOUNT_SCOPES).default("all"),
    categoryId: z.string().uuid().nullable().default(null),
    productIds: z.array(z.string().uuid()).max(200).default([]),
    minSpend: cents.nullable().default(null),
    maxUses: z.number().int().min(1).max(1_000_000).nullable().default(null),
    perPerson: z.number().int().min(1).max(1000).nullable().default(null),
    startsAt: z.coerce.date().nullable().default(null),
    endsAt: z.coerce.date().nullable().default(null),
    active: z.boolean().default(true),
  })
  .superRefine((v, ctx) => {
    if (v.kind === "percent" && (v.value < 1 || v.value > 100)) ctx.addIssue({ code: "custom", message: "A percentage is 1 to 100.", path: ["value"] });
    if (v.kind === "amount" && v.value < 1) ctx.addIssue({ code: "custom", message: "How much off?", path: ["value"] });
    if (v.appliesTo === "category" && !v.categoryId) ctx.addIssue({ code: "custom", message: "Pick the category it's for.", path: ["categoryId"] });
    if (v.appliesTo === "products" && v.productIds.length === 0) ctx.addIssue({ code: "custom", message: "Pick at least one product.", path: ["productIds"] });
    if (v.startsAt && v.endsAt && v.endsAt <= v.startsAt) ctx.addIssue({ code: "custom", message: "It has to end after it starts.", path: ["endsAt"] });
  });
export type CodeEdit = z.infer<typeof codeEditSchema>;
