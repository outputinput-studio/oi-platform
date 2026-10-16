"use client";

import { useActionState, useEffect, useState } from "react";
import { checkoutAction, clearCartAction, previewCodeAction, quoteAction, type CartState } from "@/modules/orders/actions";
import { taxOn } from "@/modules/orders/cart";
import { quoteFor, ratePriceLabel, ratesFor, whyNoRates, type Shipping } from "@/modules/sites/shipping";
import { formatPrice, type Currency } from "@/modules/sites/shop";
import { FieldErrors } from "@/lib/field-errors";
import { INVALID } from "./storefront-form";

const input = `block h-12 w-full rounded-[6px] border border-[var(--border)] bg-transparent px-3.5 text-[16px] outline-none focus:border-[var(--accent)] ${INVALID}`;

/**
 * Who's buying, where it goes and how. Delivery options follow the
 * country (and postcode, for local delivery) as they're typed; picking up
 * needs no street address. Payment happens on the next page — unless
 * delivery there is quoted individually, when the same details go to the
 * team as a quote request instead.
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
  canQuote,
}: {
  needsAddress: boolean;
  countries: { code: string; name: string }[];
  defaultCountry: string;
  testMode: boolean;
  shipping: Shipping;
  subtotal: number;
  currency: Currency;
  tax: { rate: number; included: boolean; name: string };
  /** The site has an enquiry form for quote requests to go through. */
  canQuote: boolean;
}) {
  const [state, act, pending] = useActionState(checkoutAction, {} as CartState);
  const [quoteState, askQuote, quoting] = useActionState(quoteAction, {} as CartState);
  const [codeText, setCodeText] = useState("");
  const [code, setCode] = useState<{ code: string; off: number; freeShipping: boolean } | null>(null);
  const [codeError, setCodeError] = useState("");
  const [checking, setChecking] = useState(false);
  const applyCode = async () => {
    setChecking(true);
    setCodeError("");
    const email = (document.querySelector('input[name="email"]') as HTMLInputElement | null)?.value ?? "";
    const r = await previewCodeAction(codeText, email).catch(() => ({ error: "Couldn't check that code. Try again." }));
    setChecking(false);
    if ("ok" in r && r.ok) setCode({ code: r.code ?? codeText.toUpperCase(), off: r.off ?? 0, freeShipping: !!r.freeShipping });
    else {
      setCode(null);
      setCodeError(r.error ?? "That code doesn't work.");
    }
  };
  const [country, setCountry] = useState(defaultCountry);
  const [postcode, setPostcode] = useState("");
  const countryName = countries.find((c) => c.code === country)?.name ?? country;
  const quote = needsAddress ? quoteFor(shipping, country, countryName) : null;
  const rates = needsAddress ? ratesFor(shipping, { country, postcode }, subtotal) : [];
  const fmtMoney = (c: number) => formatPrice(c, currency);
  const none = needsAddress && !quote ? whyNoRates(shipping, { country, postcode }, subtotal) : null;
  const noneText = !none
    ? ""
    : none.why === "postcode"
      ? none.typed
        ? `Sorry, we don't deliver to ${postcode.trim()}. Get in touch and we'll sort something out.`
        : "We deliver here ourselves, to some postcodes. Enter your postcode to see if you're covered."
      : none.why === "total"
        ? `Sorry, none of our delivery options cover an order of ${fmtMoney(subtotal)}. Get in touch and we'll sort something out.`
        : `Sorry, we don't send to ${countryName} yet. Get in touch and we'll sort something out.`;
  const [picked, setPicked] = useState("");
  const rate = rates.find((r) => r.id === picked) ?? rates[0];
  const pickup = rate?.kind === "pickup";
  const deliveryPrice = code?.freeShipping ? 0 : (rate?.price ?? 0);
  const total = taxOn(subtotal - (code?.off ?? 0) + deliveryPrice, tax.rate, tax.included);
  const fmt = (c: number) => formatPrice(c, currency);

  if (quoteState.ok)
    return (
      <p role="status" data-testid="quote-sent" className="rounded-[8px] border border-[var(--border)] bg-[var(--surface)] px-5 py-4 text-[16px] leading-relaxed">
        {quoteState.ok}
      </p>
    );

  return (
    <form action={quote ? askQuote : act} className="space-y-5">
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
          {quote ? (
            <div data-testid="quote-note" className="rounded-[6px] border border-[var(--border)] px-4 py-3 text-[14px]">
              <p>{quote}</p>
              <p className="mt-1 text-[13px] text-[var(--text-muted)]">{canQuote ? "Send your details and we'll be in touch. Nothing is charged now." : "Get in touch and we'll sort something out."}</p>
            </div>
          ) : rates.length === 0 ? (
            <p data-testid="no-rates" className="rounded-[6px] border border-[var(--border)] px-4 py-3 text-[14px]">
              {noneText}
            </p>
          ) : (
            <div role="radiogroup" aria-label="How it gets to you" data-field="rate" className="space-y-2">
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
      {!quote && (
      <div>
        <label htmlFor="checkout-code" className="mb-1.5 block text-[14px]">
          Discount code
        </label>
        <div className="flex gap-2">
          <input
            id="checkout-code"
            data-field="code"
            aria-invalid={Boolean(codeError) || undefined}
            value={codeText}
            onChange={(e) => {
              setCodeText(e.target.value);
              if (code) setCode(null);
            }}
            autoComplete="off"
            className={`${input} uppercase`}
          />
          <button type="button" onClick={() => void applyCode()} disabled={!codeText.trim() || checking} className="h-12 flex-none rounded-[6px] border border-[var(--border)] px-5 text-[15px] disabled:opacity-50">
            {checking ? "…" : "Apply"}
          </button>
        </div>
        <input type="hidden" name="code" value={code?.code ?? ""} />
        {code && <p className="mt-1.5 text-[13px]">{code.code} applied.</p>}
        {codeError && <p className="mt-1.5 text-[13px] text-[var(--text-muted)]">{codeError}</p>}
      </div>
      )}
      <label className="block">
        <span className="mb-1.5 block text-[14px]">Anything we should know?</span>
        <textarea name="note" rows={3} maxLength={1000} className={`${input} h-auto py-3`} />
      </label>
      {!quote && (
      <dl className="space-y-1.5 border-t border-[var(--border-soft)] pt-4 text-[14px]">
        {code && code.off > 0 && (
          <div className="flex justify-between">
            <dt>Code {code.code}</dt>
            <dd data-testid="code-off">−{fmt(code.off)}</dd>
          </div>
        )}
        {needsAddress && rate && (
          <div className="flex justify-between">
            <dt>{rate.name}</dt>
            <dd>{code?.freeShipping ? "Free with your code" : ratePriceLabel(rate.price, fmt)}</dd>
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
      )}
      {(quote ? quoteState.error : state.error) && (
        <p className="rounded-[6px] border border-[var(--border)] px-4 py-3 text-[14px]">
          {quote ? quoteState.error : state.error}
          <FieldErrors fields={quote ? quoteState.fields : state.fields} />
        </p>
      )}
      {quote ? (
        <button type="submit" disabled={quoting || !canQuote} className="h-12 w-full rounded-[6px] bg-[var(--accent)] text-[15px] font-medium text-[var(--accent-fg)] hover:opacity-90 disabled:opacity-60">
          {quoting ? "Sending…" : "Ask for a quote"}
        </button>
      ) : (
        <>
          <button
            type="submit"
            disabled={pending || (needsAddress && rates.length === 0)}
            className="h-12 w-full rounded-[6px] bg-[var(--accent)] text-[15px] font-medium text-[var(--accent-fg)] hover:opacity-90 disabled:opacity-60"
          >
            {pending ? "One moment…" : testMode ? "Continue to test payment" : "Continue to payment"}
          </button>
          {needsAddress && rates.length === 0 && (
            <p data-testid="cant-continue" className="text-[13.5px]">
              {noneText}
            </p>
          )}
          <p className="text-[13px] text-[var(--text-muted)]">{testMode ? "This is a test shop: nothing real is charged." : "You'll pay securely with Stripe. We never see your card."}</p>
        </>
      )}
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

/** Takes things that can't be bought out of the cart cookie, once the page has said so. */
export function TidyCart() {
  const [done, setDone] = useState(false);
  useEffect(() => {
    void fetch("/api/cart/tidy", { method: "POST" })
      .then(() => setDone(true))
      .catch(() => {});
  }, []);
  // A marker for tests: the cookie is tidy from here on.
  return done ? <span data-testid="cart-tidied" hidden /> : null;
}
