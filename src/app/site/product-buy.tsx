"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { addToCartAction } from "@/modules/orders/actions";
import { choiceText, describeChoice, listOptions, variantKey, type ProductOption, type VariantState } from "@/modules/products/options";
import { FieldErrors } from "@/lib/field-errors";
import { EmailQuote } from "./email-quote";
import { INVALID } from "./storefront-form";

export type BuyVariant = { key: string; values: string[]; state: VariantState; price: string | null; was: string | null; note: string };

const input = `block h-12 w-full rounded-[6px] border border-[var(--border)] bg-transparent px-3.5 text-[16px] outline-none focus:border-[var(--accent)] ${INVALID}`;

/**
 * A product with options, on its page: pick from each list (Size, then
 * Colour), fill in what it asks for, and the price, the line under it and
 * Add to cart follow the combination picked. A value with nothing left in
 * the current mix is struck through. Nothing is picked to start with, so
 * nobody buys the wrong size by not looking.
 */
export function ProductBuy({
  productId,
  productName,
  options,
  variants,
  base,
  canCart,
  quote,
}: {
  productId: string;
  productName: string;
  options: ProductOption[];
  variants: BuyVariant[];
  /** The product before anything is picked: "From $420". */
  base: { price: string | null; was: string | null; note: string };
  /** Add to cart shows: for sale, priced, and the shop takes payments. */
  canCart: boolean;
  /** Email quote shows, with its form's settings. */
  quote: { alone: boolean; countries: { code: string; name: string }[]; defaultCountry: string } | null;
}) {
  const lists = listOptions(options);
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  const [state, setState] = useState<{ ok?: string; error?: string; fields?: string[] }>({});

  const values = lists.map((o) => picked[o.id]);
  const complete = values.every(Boolean);
  const variant = complete && lists.length ? variants.find((v) => v.key === variantKey(values as string[])) : undefined;
  const shown = variant ?? base;
  const sayChoice = choiceText(describeChoice(options, complete ? (values as string[]) : undefined, answers));

  /** Whether a value can be had alongside what's picked in the other list. */
  const open = (optIndex: number, value: string) =>
    variants.some((v) => v.state === "available" && v.values[optIndex] === value && lists.every((o, j) => j === optIndex || !picked[o.id] || v.values[j] === picked[o.id]));

  const add = () => {
    const missing = lists.filter((o) => !picked[o.id]);
    const unanswered = options.filter((o) => o.kind === "fill" && o.required && !answers[o.id]?.trim());
    if (missing.length || unanswered.length) {
      const first = missing[0] ?? unanswered[0];
      return setState({
        error: missing.length ? `Choose a ${first.name.toLowerCase()} first.` : `${first.name}: fill this in.`,
        fields: [...missing, ...unanswered].map((o) => `opt-${o.id}`),
      });
    }
    if (variant && variant.state !== "available") return setState({ error: `${variant.values.join(" · ")} is ${variant.note.toLowerCase()}.`, fields: lists.map((o) => `opt-${o.id}`) });
    start(async () => setState(await addToCartAction(productId, { v: lists.length ? variantKey(values as string[]) : undefined, f: answers })));
  };

  return (
    <div>
      <p data-testid="product-price" className="mt-3 text-[20px]">
        {shown.price}
        {shown.was && <s className="ml-2 text-[16px] text-[var(--text-muted)]">{shown.was}</s>}
      </p>
      <p data-testid="product-note" className="mt-1 text-[14px] text-[var(--text-muted)]">
        {shown.note}
      </p>

      <div className="mt-6 space-y-5">
        {options.map((o) => {
          const at = lists.indexOf(o);
          if (o.kind === "list")
            return (
              <fieldset key={o.id} data-field={`opt-${o.id}`} data-testid={`option-${o.name}`}>
                <legend className="mb-2 text-[14px]">
                  {o.name}
                  {picked[o.id] && <span className="text-[var(--text-muted)]"> — {picked[o.id]}</span>}
                </legend>
                <div role="radiogroup" aria-label={o.name} className="flex flex-wrap gap-2">
                  {o.values.map((val) => {
                    const on = picked[o.id] === val;
                    const can = open(at, val);
                    return (
                      <button
                        key={val}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        aria-label={can ? val : `${val}, not available`}
                        onClick={() => {
                          setPicked((cur) => ({ ...cur, [o.id]: val }));
                          setState({});
                        }}
                        className={`min-w-12 h-11 rounded-[6px] border px-4 text-[15px] ${on ? "border-[var(--text)] bg-[var(--text)] text-[var(--bg)]" : "border-[var(--border)] hover:border-[var(--text-muted)]"} ${can ? "" : "text-[var(--text-muted)] line-through"}`}
                      >
                        {val}
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            );
          const id = `opt-${o.id}`;
          return (
            <div key={o.id}>
              <label htmlFor={id} className="mb-1.5 block text-[14px]">
                {o.name}
                {!o.required && <span className="text-[var(--text-muted)]"> (optional)</span>}
              </label>
              {o.answer === "choice" ? (
                <select id={id} data-field={id} value={answers[o.id] ?? ""} onChange={(e) => setAnswers((cur) => ({ ...cur, [o.id]: e.target.value }))} className={input}>
                  <option value="">Pick one</option>
                  {o.values.map((val) => (
                    <option key={val} value={val}>
                      {val}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  id={id}
                  data-field={id}
                  inputMode={o.answer === "number" ? "decimal" : undefined}
                  maxLength={60}
                  value={answers[o.id] ?? ""}
                  onChange={(e) => setAnswers((cur) => ({ ...cur, [o.id]: e.target.value }))}
                  className={input}
                />
              )}
              {o.help && <p className="mt-1.5 text-[13px] text-[var(--text-muted)]">{o.help}</p>}
            </div>
          );
        })}
      </div>

      {canCart && (
        <div className="mt-6">
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={pending}
              onClick={add}
              className="h-12 rounded-[6px] bg-[var(--accent)] px-7 text-[15px] font-medium text-[var(--accent-fg)] hover:opacity-90 disabled:opacity-60"
            >
              {pending ? "Adding…" : "Add to cart"}
            </button>
            {state.ok && (
              <Link href="/shop/cart" className="text-[14px] underline underline-offset-4">
                Added — view your cart
              </Link>
            )}
          </div>
          {state.error && (
            <p role="alert" className="mt-2 text-[14px] text-[var(--text-muted)]">
              {state.error}
              <FieldErrors fields={state.fields} />
            </p>
          )}
        </div>
      )}
      {quote && <EmailQuote productId={productId} productName={productName} alone={quote.alone} countries={quote.countries} defaultCountry={quote.defaultCountry} choice={sayChoice} />}
    </div>
  );
}
