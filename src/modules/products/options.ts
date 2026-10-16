import { z } from "zod";
import { PRODUCT_MAKES, type ProductMake } from "./kinds";

/**
 * Product options, as in design/admin.html: up to two per product.
 *
 * - "Choose from a list" (Size: 6, 8, 10): every mix of list values is a
 *   combination with its own price, code, how it's made and stock. Stock
 *   and availability sit on the combination, not the product.
 * - "Customer fills in" (Made to size: their measurement): a box on the
 *   product page. No stock and no price change; what they type comes
 *   through on the order so the team knows what to make.
 *
 * Pure: the editor, the storefront, the cart and the order code all read
 * a product's options the same way.
 */

export const MAX_OPTIONS = 2;
export const MAX_VALUES = 20;
export const MAX_COMBINATIONS = 100;
/** What a customer types for a fill-in option. Short, so the cart cookie stays small. */
export const MAX_ANSWER = 60;

const cents = z.number().int().min(0, "A price can't be below zero.").max(100_000_000);

export const OPTION_KINDS = ["list", "fill"] as const;
export const ANSWER_KINDS = ["text", "number", "choice"] as const;

export const optionSchema = z
  .object({
    id: z.string().min(1).max(40),
    name: z.string().trim().min(1, "Give the option a name, like Size.").max(40),
    kind: z.enum(OPTION_KINDS).default("list"),
    /** A list's values, or a fill-in's choices when its answer is "choice". */
    values: z.array(z.string().trim().min(1).max(40)).max(MAX_VALUES, `Up to ${MAX_VALUES} values.`).default([]),
    /** Fill-in only: what kind of answer. */
    answer: z.enum(ANSWER_KINDS).default("text"),
    /** Fill-in only: the line under the box on the product page. */
    help: z.string().trim().max(200).default(""),
    /** Fill-in only: whether they must answer. */
    required: z.boolean().default(true),
  })
  .superRefine((o, ctx) => {
    if (o.kind === "list" && o.values.length === 0) ctx.addIssue({ code: "custom", message: `List the ${o.name.toLowerCase() || "values"}, separated by commas.`, path: ["values"] });
    if (o.kind === "fill" && o.answer === "choice" && o.values.length < 2) ctx.addIssue({ code: "custom", message: "Give them at least two choices, separated by commas.", path: ["values"] });
    const seen = new Set<string>();
    for (const v of o.values) {
      if (seen.has(v.toLowerCase())) ctx.addIssue({ code: "custom", message: `${v} is in the list twice.`, path: ["values"] });
      seen.add(v.toLowerCase());
    }
  });
export type ProductOption = z.infer<typeof optionSchema>;

export const optionsSchema = z
  .array(optionSchema)
  .max(MAX_OPTIONS, "Two options is the limit.")
  .superRefine((opts, ctx) => {
    const names = new Set<string>();
    opts.forEach((o, i) => {
      if (names.has(o.name.toLowerCase())) ctx.addIssue({ code: "custom", message: "Give each option its own name.", path: [i, "name"] });
      names.add(o.name.toLowerCase());
    });
    if (combinations(opts).length > MAX_COMBINATIONS) ctx.addIssue({ code: "custom", message: `That makes more than ${MAX_COMBINATIONS} combinations. Fewer values, please.`, path: [0, "values"] });
  });

/** One combination of list values: its own price, code, how it's made and stock. */
export const variantSchema = z.object({
  /** One value per list option, in the options' order. */
  values: z.array(z.string().trim().min(1).max(40)).min(1).max(MAX_OPTIONS),
  /** Off: this mix isn't offered (no Black in size 10, say). */
  on: z.boolean().default(true),
  /** Null: the product's own price (and its sale). */
  price: cents.nullable().default(null),
  code: z.string().trim().max(60).default(""),
  make: z.enum(PRODUCT_MAKES).default("ready"),
  /** Ready to ship: how many (null, not counted). One only: 0 once sold, otherwise null. */
  stock: z.number().int().min(0, "Stock can't be below zero.").max(1_000_000).nullable().default(null),
});
export type Variant = z.infer<typeof variantSchema>;

/** A change to one combination from its sheet: which one, then what changed. */
export const variantPatchSchema = variantSchema.partial().extend({ values: variantSchema.shape.values });

/** Stored options; anything that doesn't read is dropped rather than breaking the page. */
export function readOptions(raw: unknown): ProductOption[] {
  const r = optionsSchema.safeParse(raw ?? []);
  if (r.success) return r.data;
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((o) => {
    const p = optionSchema.safeParse(o);
    return p.success ? [p.data] : [];
  }).slice(0, MAX_OPTIONS);
}

export function readVariants(raw: unknown): Variant[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((v) => {
    const p = variantSchema.safeParse(v);
    return p.success ? [p.data] : [];
  });
}

export const listOptions = (opts: ProductOption[]) => opts.filter((o) => o.kind === "list");
export const fillOptions = (opts: ProductOption[]) => opts.filter((o) => o.kind === "fill");

/** Every mix of list values, in order: [["6","Print"],["6","Black"],["8","Print"]…]. None without a list option. */
export function combinations(opts: ProductOption[]): string[][] {
  const lists = listOptions(opts);
  if (lists.length === 0) return [];
  return lists.reduce<string[][]>((acc, o) => acc.flatMap((a) => o.values.map((v) => [...a, v])), [[]]);
}

/** How a combination is found again: its values, joined. */
export const variantKey = (values: string[]) => values.join(" / ");
/** How a combination reads: "8 · Print". */
export const variantLabel = (values: string[]) => values.join(" · ");

/**
 * The combinations as they stand: one for every mix of the options' values,
 * with what was set on it, or the product's own way of being made until
 * something is. Settings are kept by values, so a value taken out and put
 * back (a typo fixed mid-edit) finds its price and stock again.
 */
export function variantsFor(opts: ProductOption[], stored: Variant[], make: ProductMake): Variant[] {
  const byKey = new Map(stored.map((v) => [variantKey(v.values), v]));
  return combinations(opts).map((values) => byKey.get(variantKey(values)) ?? { values, on: true, price: null, code: "", make, stock: null });
}

/**
 * The stored settings with one combination's changed. Settings for mixes
 * no longer on offer are kept for a while (see variantsFor), oldest going
 * first once there are twice as many as the most a product can have.
 */
export function upsertVariant(stored: Variant[], v: Variant, opts: ProductOption[]): Variant[] {
  const key = variantKey(v.values);
  const next = stored.some((x) => variantKey(x.values) === key) ? stored.map((x) => (variantKey(x.values) === key ? v : x)) : [...stored, v];
  const live = new Set(combinations(opts).map(variantKey));
  let spare = next.length - MAX_COMBINATIONS * 2;
  return next.filter((x) => live.has(variantKey(x.values)) || spare-- <= 0);
}

export type VariantState = "available" | "soldOut" | "sold" | "off";

/** Whether a combination can be had: off, sold (one only), sold out (counted stock at zero), or available. */
export function variantState(v: Variant): VariantState {
  if (!v.on) return "off";
  if (v.make === "oneOnly" && v.stock === 0) return "sold";
  if (v.make === "ready" && v.stock !== null && v.stock <= 0) return "soldOut";
  return "available";
}

/** The most one cart can take, after what's held for other shoppers. */
export function variantMax(v: Variant, held: number): number {
  if (variantState(v) !== "available") return 0;
  if (v.make === "oneOnly") return 1 - held;
  if (v.make === "ready" && v.stock !== null) return v.stock - held;
  return 20;
}

type Priced = { price: number | null; salePrice: number | null };

/** What one costs: the combination's own price, or the product's (on sale, when it is). Null: no price yet. */
export function unitPrice(p: Priced, v?: Pick<Variant, "price"> | null): number | null {
  if (v && v.price !== null) return v.price;
  if (p.salePrice !== null && p.price !== null && p.salePrice < p.price) return p.salePrice;
  return p.price;
}

/** The answers to fill-in options, by option id: required ones present, numbers numbers, choices from the list. */
export function checkAnswers(opts: ProductOption[], raw: Record<string, string> | undefined): { ok: true; answers: Record<string, string> } | { ok: false; field: string; message: string } {
  const answers: Record<string, string> = {};
  for (const o of fillOptions(opts)) {
    const v = String(raw?.[o.id] ?? "").trim().slice(0, MAX_ANSWER);
    if (!v) {
      if (o.required) return { ok: false, field: `opt-${o.id}`, message: `${o.name}: fill this in.` };
      continue;
    }
    if (o.answer === "number" && !/^\d+([.,]\d+)?$/.test(v)) return { ok: false, field: `opt-${o.id}`, message: `${o.name}: a number, please.` };
    if (o.answer === "choice" && !o.values.includes(v)) return { ok: false, field: `opt-${o.id}`, message: `${o.name}: pick one of the choices.` };
    answers[o.id] = v;
  }
  return { ok: true, answers };
}

export type Choice = { name: string; value: string };

/** What was chosen, in the options' order, for the cart, the order and its emails: Size 8, Colour Print, Made to size 10. */
export function describeChoice(opts: ProductOption[], values: string[] | undefined, answers: Record<string, string> | undefined): Choice[] {
  let i = 0;
  return opts.flatMap((o) => {
    if (o.kind === "list") {
      const value = values?.[i++];
      return value ? [{ name: o.name, value }] : [];
    }
    const value = answers?.[o.id];
    return value ? [{ name: o.name, value }] : [];
  });
}

/** "Size: 8, Colour: Print". */
export const choiceText = (c: Choice[] | undefined) => (c ?? []).map((x) => `${x.name}: ${x.value}`).join(", ");

/** A product name with what was chosen: "Teal bikini (Size: 8, Colour: Print)". */
export const withChoice = (name: string, c: Choice[] | undefined) => (c?.length ? `${name} (${choiceText(c)})` : name);
