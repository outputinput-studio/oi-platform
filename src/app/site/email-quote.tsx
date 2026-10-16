"use client";

import { useActionState, useState } from "react";
import { productQuoteAction, type CartState } from "@/modules/orders/actions";
import { FieldErrors } from "@/lib/field-errors";
import { INVALID } from "./storefront-form";

const input = `block h-12 w-full rounded-[6px] border border-[var(--border)] bg-transparent px-3.5 text-[16px] outline-none focus:border-[var(--accent)] ${INVALID}`;

/**
 * Email quote on a product page: on its own (the main button) or beside
 * Add to cart (a quieter one). Opens a short form in place — who, where
 * it's going, how many — and the team emails a price. Nothing is charged.
 */
export function EmailQuote({
  productId,
  productName,
  alone,
  countries,
  defaultCountry,
  choice = "",
}: {
  productId: string;
  productName: string;
  alone: boolean;
  countries: { code: string; name: string }[];
  defaultCountry: string;
  /** What's picked on the page ("Size: 8, Colour: Print"), sent along with the request. */
  choice?: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, act, pending] = useActionState(productQuoteAction.bind(null, productId), {} as CartState);

  if (!open)
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          alone
            ? "mt-6 h-12 rounded-[6px] bg-[var(--accent)] px-7 text-[15px] font-medium text-[var(--accent-fg)] hover:opacity-90"
            : "mt-3 h-12 rounded-[6px] border border-[var(--border)] px-7 text-[15px] font-medium hover:border-[var(--text-muted)]"
        }
      >
        Email quote
      </button>
    );

  if (state.ok)
    return (
      <p role="status" data-testid="product-quote-sent" className="mt-6 rounded-[8px] border border-[var(--border)] bg-[var(--surface)] px-5 py-4 text-[16px] leading-relaxed">
        {state.ok}
      </p>
    );

  return (
    <form action={act} data-testid="product-quote" className="mt-6 space-y-4 border-t border-[var(--border-soft)] pt-6">
      <div>
        <h2 className="text-[18px] font-medium">Get a quote</h2>
        <p className="mt-1 text-[14px] text-[var(--text-muted)]">Tell us where {productName} is going and we&apos;ll email you a price, delivery included. Nothing is charged now.</p>
      </div>
      <Field label="Name" name="name" autoComplete="name" required />
      <Field label="Email" name="email" type="email" autoComplete="email" required />
      <Field label="Phone" name="phone" type="tel" autoComplete="tel" hint="Optional." />
      <div>
        <label htmlFor="quote-country" className="mb-1.5 block text-[14px]">
          Country
        </label>
        <select id="quote-country" name="country" defaultValue={defaultCountry} autoComplete="country" className={input}>
          {countries.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Town or suburb" name="city" autoComplete="address-level2" />
        <Field label="Postcode" name="postcode" autoComplete="postal-code" required />
      </div>
      <Field label="How many" name="qty" type="number" defaultValue="1" min={1} max={999} />
      <label className="block">
        <span className="mb-1.5 block text-[14px]">Anything we should know?</span>
        <textarea name="note" rows={3} maxLength={1000} className={`${input} h-auto py-3`} />
      </label>
      <input type="hidden" name="choice" value={choice} />
      {choice && <p className="text-[14px] text-[var(--text-muted)]">For {choice}.</p>}
      {/* The trap: people never see it, bots fill it in. */}
      <div className="absolute -left-[9999px] top-auto h-px w-px overflow-hidden" aria-hidden>
        <label htmlFor={`website_quote_${productId}`}>Website</label>
        <input id={`website_quote_${productId}`} name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>
      {state.error && (
        <p className="rounded-[6px] border border-[var(--border)] px-4 py-3 text-[14px]">
          {state.error}
          <FieldErrors fields={state.fields} />
        </p>
      )}
      <button type="submit" disabled={pending} className="h-12 w-full rounded-[6px] bg-[var(--accent)] text-[15px] font-medium text-[var(--accent-fg)] hover:opacity-90 disabled:opacity-60">
        {pending ? "Sending…" : "Send for a quote"}
      </button>
    </form>
  );
}

function Field({ label, name, type = "text", autoComplete, required, hint, defaultValue, min, max }: { label: string; name: string; type?: string; autoComplete?: string; required?: boolean; hint?: string; defaultValue?: string; min?: number; max?: number }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[14px]">{label}</span>
      <input name={name} type={type} autoComplete={autoComplete} required={required} defaultValue={defaultValue} min={min} max={max} className={input} />
      {hint && <span className="mt-1 block text-[12.5px] text-[var(--text-muted)]">{hint}</span>}
    </label>
  );
}
