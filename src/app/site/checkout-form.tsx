"use client";

import { useActionState, useEffect } from "react";
import { checkoutAction, clearCartAction, type CartState } from "@/modules/orders/actions";

const input = "block h-12 w-full rounded-[6px] border border-[var(--border)] bg-transparent px-3.5 text-[16px] outline-none focus:border-[var(--accent)]";

/** Who's buying and where it goes. Payment happens on the next page (Stripe's, or the test one). */
export function CheckoutForm({ needsAddress, countries, defaultCountry, testMode }: { needsAddress: boolean; countries: { code: string; name: string }[]; defaultCountry: string; testMode: boolean }) {
  const [state, act, pending] = useActionState(checkoutAction, {} as CartState);
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
          <legend className="mb-1 text-[18px] font-medium">Deliver to</legend>
          <Field label="Street address" name="line1" autoComplete="address-line1" required />
          <Field label="Apartment, unit, etc." name="line2" autoComplete="address-line2" />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Town or suburb" name="city" autoComplete="address-level2" required />
            <Field label="State" name="state" autoComplete="address-level1" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Postcode" name="postcode" autoComplete="postal-code" required />
            <div>
              <label htmlFor="checkout-country" className="mb-1.5 block text-[14px]">
                Country
              </label>
              <select id="checkout-country" name="country" defaultValue={defaultCountry} autoComplete="country" className={input}>
                {countries.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </fieldset>
      )}
      <label className="block">
        <span className="mb-1.5 block text-[14px]">Anything we should know?</span>
        <textarea name="note" rows={3} maxLength={1000} className={`${input} h-auto py-3`} />
      </label>
      {state.error && <p className="rounded-[6px] border border-[var(--border)] px-4 py-3 text-[14px]">{state.error}</p>}
      <button type="submit" disabled={pending} className="h-12 w-full rounded-[6px] bg-[var(--accent)] text-[15px] font-medium text-white hover:opacity-90 disabled:opacity-60">
        {pending ? "One moment…" : testMode ? "Continue to test payment" : "Continue to payment"}
      </button>
      <p className="text-[13px] text-[var(--text-muted)]">{testMode ? "This is a test shop: nothing real is charged." : "You'll pay securely with Stripe. We never see your card."}</p>
    </form>
  );
}

function Field({ label, name, type = "text", autoComplete, required, hint }: { label: string; name: string; type?: string; autoComplete?: string; required?: boolean; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[14px]">{label}</span>
      <input name={name} type={type} autoComplete={autoComplete} required={required} className={input} />
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
