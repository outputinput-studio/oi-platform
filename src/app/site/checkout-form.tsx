"use client";

import { useActionState, useEffect, useState } from "react";
import { checkoutAction, clearCartAction, type CartState } from "@/modules/orders/actions";
import { taxOn } from "@/modules/orders/cart";
import { ratePriceLabel, ratesFor, type Shipping } from "@/modules/sites/shipping";
import { formatPrice, type Currency } from "@/modules/sites/shop";

const input = "block h-12 w-full rounded-[6px] border border-[var(--border)] bg-transparent px-3.5 text-[16px] outline-none focus:border-[var(--accent)]";

/**
 * Who's buying, where it goes and how. Delivery options follow the
 * country (and postcode, for local delivery) as they're typed; picking up
 * needs no street address. Payment happens on the next page.
 */
export function CheckoutForm({
  needsAddress,
  countries,
  defaultCountry,
  testMode,
  shipping,
  subtotal,
  currency,
  tax,
}: {
  needsAddress: boolean;
  countries: { code: string; name: string }[];
  defaultCountry: string;
  testMode: boolean;
  shipping: Shipping;
  subtotal: number;
  currency: Currency;
  tax: { rate: number; included: boolean; name: string };
}) {
  const [state, act, pending] = useActionState(checkoutAction, {} as CartState);
  const [country, setCountry] = useState(defaultCountry);
  const [postcode, setPostcode] = useState("");
  const rates = needsAddress ? ratesFor(shipping, { country, postcode }, subtotal) : [];
  const [picked, setPicked] = useState("");
  const rate = rates.find((r) => r.id === picked) ?? rates[0];
  const pickup = rate?.kind === "pickup";
  const deliveryPrice = rate?.price ?? 0;
  const total = taxOn(subtotal + deliveryPrice, tax.rate, tax.included);
  const fmt = (c: number) => formatPrice(c, currency);
  const countryName = countries.find((c) => c.code === country)?.name ?? country;

  return (
    <form action={act} className="space-y-5">
      <fieldset className="space-y-4">
        <legend className="mb-1 text-[18px] font-medium">Your details</legend>
        <Field label="Name" name="name" autoComplete="name" required />
        <Field label="Email" name="email" type="email" autoComplete="email" required hint="Your receipt goes here." />
        <Field label="Phone" name="phone" type="tel" autoComplete="tel" hint="Optional. In case the courier needs you." />
      </fieldset>
      {needsAddress && (
        <fieldset className="space-y-4">
          <legend className="mb-1 text-[18px] font-medium">Delivery</legend>
          <div>
            <label htmlFor="checkout-country" className="mb-1.5 block text-[14px]">
              Country
            </label>
            <select id="checkout-country" name="country" value={country} onChange={(e) => setCountry(e.target.value)} autoComplete="country" className={input}>
              {countries.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          {!pickup && (
            <>
              <Field label="Street address" name="line1" autoComplete="address-line1" required />
              <Field label="Apartment, unit, etc." name="line2" autoComplete="address-line2" />
              <div className="grid grid-cols-2 gap-3">
                <Field label="Town or suburb" name="city" autoComplete="address-level2" required />
                <Field label="State" name="state" autoComplete="address-level1" />
              </div>
            </>
          )}
          <Field label="Postcode" name="postcode" autoComplete="postal-code" required={!pickup} value={postcode} onChange={setPostcode} />
          {rates.length === 0 ? (
            <p data-testid="no-rates" className="rounded-[6px] border border-[var(--border)] px-4 py-3 text-[14px]">
              Sorry, we don&apos;t send to {countryName} yet. Get in touch and we&apos;ll sort something out.
            </p>
          ) : (
            <div role="radiogroup" aria-label="How it gets to you" className="space-y-2">
              {rates.map((r) => (
                <label key={r.id} className={`flex cursor-pointer items-center gap-3 rounded-[6px] border px-4 py-3 ${rate?.id === r.id ? "border-[var(--accent)]" : "border-[var(--border)]"}`}>
                  <input type="radio" name="rate" value={r.id} checked={rate?.id === r.id} onChange={() => setPicked(r.id)} className="accent-[var(--accent)]" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px]">{r.name}</span>
                    {r.estimate && <span className="block text-[13px] text-[var(--text-muted)]">{r.estimate}</span>}
                  </span>
                  <span className="text-[15px]">{ratePriceLabel(r.price, fmt)}</span>
                </label>
              ))}
            </div>
          )}
        </fieldset>
      )}
      <label className="block">
        <span className="mb-1.5 block text-[14px]">Anything we should know?</span>
        <textarea name="note" rows={3} maxLength={1000} className={`${input} h-auto py-3`} />
      </label>
      <dl className="space-y-1.5 border-t border-[var(--border-soft)] pt-4 text-[14px]">
        {needsAddress && rate && (
          <div className="flex justify-between">
            <dt>{rate.name}</dt>
            <dd>{ratePriceLabel(rate.price, fmt)}</dd>
          </div>
        )}
        {total.tax > 0 && (
          <div className="flex justify-between text-[var(--text-muted)]">
            <dt>{tax.included ? `Includes ${tax.name}` : `${tax.name} ${tax.rate}%`}</dt>
            <dd>{fmt(total.tax)}</dd>
          </div>
        )}
        <div className="flex justify-between text-[17px] font-medium">
          <dt>To pay</dt>
          <dd data-testid="checkout-total">{fmt(total.total)}</dd>
        </div>
      </dl>
      {state.error && <p className="rounded-[6px] border border-[var(--border)] px-4 py-3 text-[14px]">{state.error}</p>}
      <button
        type="submit"
        disabled={pending || (needsAddress && rates.length === 0)}
        className="h-12 w-full rounded-[6px] bg-[var(--accent)] text-[15px] font-medium text-white hover:opacity-90 disabled:opacity-60"
      >
        {pending ? "One moment…" : testMode ? "Continue to test payment" : "Continue to payment"}
      </button>
      <p className="text-[13px] text-[var(--text-muted)]">{testMode ? "This is a test shop: nothing real is charged." : "You'll pay securely with Stripe. We never see your card."}</p>
    </form>
  );
}

function Field({
  label,
  name,
  type = "text",
  autoComplete,
  required,
  hint,
  value,
  onChange,
}: {
  label: string;
  name: string;
  type?: string;
  autoComplete?: string;
  required?: boolean;
  hint?: string;
  value?: string;
  onChange?: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[14px]">{label}</span>
      <input
        name={name}
        type={type}
        autoComplete={autoComplete}
        required={required}
        className={input}
        {...(onChange ? { value: value ?? "", onChange: (e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value) } : {})}
      />
      {hint && <span className="mt-1 block text-[12.5px] text-[var(--text-muted)]">{hint}</span>}
    </label>
  );
}

/** Empties the cart once an order is paid. */
export function ClearCart() {
  useEffect(() => {
    void clearCartAction();
  }, []);
  return null;
}
