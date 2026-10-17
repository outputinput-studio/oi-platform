"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { keepValues } from "../keep-values";
import { FieldErrors } from "@/lib/field-errors";
import {
  codeForOrderAction,
  confirmEmailAction,
  saveAddressAction,
  saveDetailsAction,
  setPasswordAction,
  signInAction,
  trackAction,
  type FormState,
  type SignInState,
  type TrackState,
} from "@/modules/customers/actions";
import { waitText } from "@/lib/time";
import { INVALID } from "./storefront-form";
import { cardClass, primaryClass, secondaryClass } from "./account-styles";
import { TimelineView } from "./timeline-view";

/**
 * The storefront's account forms (design/storefront-accounts.html): signing
 * in by email code (or a password, where the shop allows one), the account's
 * details, an address, and Track my order. All of it reads the site's theme
 * variables, like every storefront form.
 */

const inputClass = `block h-12 w-full rounded-[6px] border border-[var(--border)] bg-transparent px-3.5 text-[16px] text-[var(--text)] outline-none focus:border-[var(--accent)] ${INVALID}`;
const labelClass = "mb-1.5 block text-[14px]";

function Label({ htmlFor, children }: { htmlFor: string; children: React.ReactNode }) {
  return (
    <label htmlFor={htmlFor} className={labelClass}>
      {children}
    </label>
  );
}

/** Ticks down to when another code may be asked for. */
function useSecondsUntil(at?: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!at) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [at]);
  return at ? Math.max(0, Math.ceil((at - now) / 1000)) : 0;
}

// ───────────────────────── signing in ─────────────────────────

/** The whole sign-in: email, then a code (or their password). `next` is where they land after. */
export function SignInForm({ next }: { next: string }) {
  const [state, act, pending] = useActionState(signInAction, { step: "email", next } as SignInState);
  if (state.step === "code") return <CodeStep state={state} act={act} pending={pending} />;
  if (state.step === "password") return <PasswordStep state={state} act={act} pending={pending} />;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[30px] font-semibold tracking-[-0.5px]">Sign in</h1>
        <p className="mt-1.5 text-[15px] text-[var(--text-body)]">Start with your email. We&apos;ll work out the rest.</p>
      </div>
      <form action={act} className="space-y-4">
        <input type="hidden" name="intent" value="email" />
        <input type="hidden" name="next" value={state.next} />
        <HoneyPot />
        <div>
          <Label htmlFor="account-email">Your email</Label>
          <input id="account-email" name="email" type="email" inputMode="email" autoComplete="email" required autoFocus aria-invalid={state.fields?.includes("email") || undefined} className={inputClass} />
        </div>
        {state.error && (
          <p role="alert" className="text-[14px]">
            {state.error}
            <FieldErrors fields={state.fields} />
          </p>
        )}
        <button type="submit" disabled={pending} className={primaryClass}>
          {pending ? "One moment…" : "Continue"}
        </button>
      </form>
      <div className={cardClass}>
        <p className="text-[15px] font-medium">First time here?</p>
        <p className="mt-1 text-[14px] leading-relaxed text-[var(--text-muted)]">Same box. We email you a six-digit code and your email becomes your account — no form, and nothing to remember next time.</p>
      </div>
    </div>
  );
}

/** A trap only bots fill in. */
function HoneyPot() {
  return (
    <div aria-hidden className="absolute -left-[9999px] h-px w-px overflow-hidden">
      <label>
        Website
        <input name="website" tabIndex={-1} autoComplete="off" />
      </label>
    </div>
  );
}

function CodeStep({ state, act, pending, embedded = false }: { state: SignInState; act: (f: FormData) => void; pending: boolean; embedded?: boolean }) {
  const wait = useSecondsUntil(state.resendAt);
  const locked = state.notice === "locked" || state.notice === "busy";
  return (
    <div data-testid="code-step" className="space-y-4">
      <div>
        {embedded ? <p className="text-[17px] font-medium">Check your email</p> : <h1 className="text-[30px] font-semibold tracking-[-0.5px]">Check your email</h1>}
        <p className="mt-1.5 text-[15px] text-[var(--text-body)]">
          We sent six digits to <span className="text-[var(--text)]">{state.email}</span>. It works for ten minutes.
        </p>
        {!embedded && (
          <p className="mt-1 text-[14px] text-[var(--text-muted)]">
            Not your email?{" "}
            <a href={`/account${state.next !== "/account" ? `?next=${encodeURIComponent(state.next)}` : ""}`} className="underline underline-offset-4">
              Change it
            </a>
          </p>
        )}
      </div>
      {state.next === "/shop/checkout" && <p className={`${cardClass} text-[14px] leading-relaxed`}>Your basket is held. You&apos;ll come back to checkout with your saved address filled in.</p>}
      {state.devCode && <DevCode code={state.devCode} />}
      {state.notice === "locked" || state.notice === "busy" ? (
        <div role="alert" data-testid="code-locked" className={cardClass}>
          <p className="text-[15px] font-medium">Let&apos;s slow down a moment</p>
          <p className="mt-1 text-[14px] leading-relaxed text-[var(--text-body)]">
            {state.notice === "busy"
              ? `Lots of codes have gone out to this email just now. You can ask for another in ${waitText(state.wait ?? 60)}.`
              : `Too many tries. You can ask for another code in ${waitText(state.wait ?? 120)} — the wait doubles each time, up to an hour, then clears. Your account is fine.`}
          </p>
        </div>
      ) : state.notice === "expired" ? (
        <form action={act} role="alert" data-testid="code-expired" className={cardClass}>
          <input type="hidden" name="intent" value="resend" />
          <p className="text-[15px] font-medium">That code has run out</p>
          <p className="mt-1 text-[14px] leading-relaxed text-[var(--text-body)]">Codes last ten minutes. Here&apos;s a fresh one, no need to start over.</p>
          <button type="submit" disabled={pending} className={`${primaryClass} mt-3`}>
            Send a new code
          </button>
        </form>
      ) : (
        <form action={act} className="space-y-3">
          <input type="hidden" name="intent" value="code" />
          <div>
            <Label htmlFor="account-code">Code</Label>
            <input
              id="account-code"
              name="code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="\s*\d{3}\s?\d{3}\s*"
              maxLength={9}
              required
              autoFocus
              aria-invalid={state.notice === "wrong" || state.fields?.includes("code") || undefined}
              className={`${inputClass} font-mono tracking-[4px]`}
            />
            <p className="mt-1.5 text-[13px] text-[var(--text-muted)]">Paste the whole code if that&apos;s easier — or let your phone fill it in from the notification.</p>
          </div>
          {state.notice === "wrong" && (
            <p role="alert" className="text-[14px]">
              That code isn&apos;t right. Check the email again — the newest one is the one that works.
            </p>
          )}
          {state.error && (
            <p role="alert" className="text-[14px]">
              {state.error}
              <FieldErrors fields={state.fields} />
            </p>
          )}
          <button type="submit" disabled={pending} className={primaryClass}>
            {pending ? "One moment…" : "Continue"}
          </button>
        </form>
      )}
      {!locked && state.notice !== "expired" && (
        <form action={act} className="text-center text-[14px]">
          <input type="hidden" name="intent" value="resend" />
          {wait > 0 ? (
            <p className="text-[var(--text-muted)]">You can ask for another in {waitText(wait)}</p>
          ) : (
            <>
              <p className="mb-2 text-[13.5px] text-[var(--text-muted)]">Nothing yet? Check your junk folder — it sometimes lands there the first time.</p>
              <button type="submit" disabled={pending} className="underline underline-offset-4">
                Send it again
              </button>
            </>
          )}
        </form>
      )}
      <p className="text-center text-[13px] text-[var(--text-muted)]">We&apos;ll keep you signed in on this browser for 30 days.</p>
    </div>
  );
}

function PasswordStep({ state, act, pending }: { state: SignInState; act: (f: FormData) => void; pending: boolean }) {
  const [show, setShow] = useState(false);
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[30px] font-semibold tracking-[-0.5px]">Your password</h1>
        <p className="mt-1.5 text-[15px] text-[var(--text-body)]">You set one for {state.email}.</p>
        <p className="mt-1 text-[14px] text-[var(--text-muted)]">
          Not your email?{" "}
          <a href="/account" className="underline underline-offset-4">
            Change it
          </a>
        </p>
      </div>
      {state.notice === "locked" ? (
        <p role="alert" className={`${cardClass} text-[14px] leading-relaxed`}>
          Too many tries. You can try again in {waitText(state.wait ?? 120)} — the wait doubles each time, up to an hour, then clears. Your account is fine, and a code still gets you in.
        </p>
      ) : (
        <form action={act} className="space-y-3">
          <input type="hidden" name="intent" value="password" />
          <div>
            <Label htmlFor="account-password">Password</Label>
            <div className="relative">
              <input
                id="account-password"
                name="password"
                type={show ? "text" : "password"}
                autoComplete="current-password"
                required
                autoFocus
                aria-invalid={state.notice === "wrong" || undefined}
                className={`${inputClass} pr-16`}
              />
              <button type="button" onClick={() => setShow(!show)} className="absolute inset-y-0 right-3 text-[13.5px] text-[var(--text-muted)]">
                {show ? "Hide" : "Show"}
              </button>
            </div>
          </div>
          {state.notice === "wrong" && (
            <p role="alert" className="text-[14px]">
              That password isn&apos;t right.
            </p>
          )}
          {state.error && <p className="text-[14px]">{state.error}</p>}
          <button type="submit" disabled={pending} className={primaryClass}>
            {pending ? "One moment…" : "Sign in"}
          </button>
        </form>
      )}
      <form action={act}>
        <input type="hidden" name="intent" value="useCode" />
        <button type="submit" disabled={pending} className={secondaryClass}>
          Email me a code instead
        </button>
      </form>
      <div className={cardClass}>
        <p className="text-[15px] font-medium">Forgot your password?</p>
        <p className="mt-1 text-[14px] leading-relaxed text-[var(--text-muted)]">There&apos;s nothing to reset. Get in with a code, then change your password in Details if you want to.</p>
      </div>
    </div>
  );
}

function DevCode({ code }: { code: string }) {
  return (
    <p className="rounded-[6px] border border-dashed border-[var(--border)] px-3.5 py-2.5 text-[13.5px]">
      <span className="text-[var(--text-muted)]">A test shop with no email set up — your code is </span>
      <code data-testid="dev-code" className="font-mono text-[15px] tracking-[3px]">
        {code}
      </code>
    </p>
  );
}

/**
 * "Want to see this order later?" — after paying, or on a tracking result:
 * a code to the order's email, then the same code step, then their account.
 * `orderId` sends it to the email on that order; `email` to the one typed.
 */
export function CodeOffer({ orderId, email, next, title, text, testId }: { orderId?: string; email?: string; next: string; title: string; text: string; testId?: string }) {
  const [hidden, setHidden] = useState(false);
  const [state, act, pending] = useActionState(
    (prev: SignInState, form: FormData) => (form.get("intent") === "orderCode" ? codeForOrderAction(prev, form) : signInAction(prev, form)),
    { step: "email", next, email } as SignInState,
  );
  if (hidden) return null;
  if (state.step === "code")
    return (
      <div data-testid={testId} className={cardClass}>
        <CodeStep state={state} act={act} pending={pending} embedded />
      </div>
    );
  return (
    <form action={act} data-testid={testId} className={cardClass}>
      <input type="hidden" name="intent" value={orderId ? "orderCode" : "useCode"} />
      {orderId && <input type="hidden" name="orderId" value={orderId} />}
      <input type="hidden" name="next" value={next} />
      <p className="text-[15px] font-medium">{title}</p>
      <p className="mt-1 text-[14px] leading-relaxed text-[var(--text-muted)]">{text}</p>
      {state.error && <p className="mt-2 text-[14px]">{state.error}</p>}
      <div className="mt-3 flex gap-2">
        <button type="submit" disabled={pending} className={`${secondaryClass} flex-1`}>
          {pending ? "Sending…" : "Email me a code"}
        </button>
        {orderId && (
          <button type="button" onClick={() => setHidden(true)} className="h-12 flex-none px-4 text-[14px] text-[var(--text-muted)]">
            No thanks
          </button>
        )}
      </div>
    </form>
  );
}

// ───────────────────────── Track my order ─────────────────────────

export function TrackForm({ accounts, signedIn }: { accounts: boolean; signedIn: boolean }) {
  const [state, act, pending] = useActionState(trackAction, {} as TrackState);
  if (state.order)
    return (
      <div data-testid="track-result" className="space-y-5">
        <TimelineView number={state.order.number} placedAt={state.order.placedAt} timeline={state.order.timeline} />
        {accounts && !signedIn && state.email && (
          <CodeOffer email={state.email} next={`/account/orders/${state.order.number}`} title="Keep an eye on it from your phone" text="Sign in with a code and all your orders sit in one place." />
        )}
        <a href="/track" className="inline-block text-[14px] underline underline-offset-4">
          Look up another order
        </a>
      </div>
    );
  return (
    <form onSubmit={keepValues(act)} className="space-y-4">
      <div>
        <Label htmlFor="track-number">Order number</Label>
        <input id="track-number" name="number" inputMode="numeric" autoComplete="off" required className={`${inputClass} font-mono`} />
      </div>
      <div>
        <Label htmlFor="track-email">Email on the order</Label>
        <input id="track-email" name="email" type="email" inputMode="email" autoComplete="email" required className={inputClass} />
      </div>
      {state.error && (
        <p role="alert" data-testid="track-error" className={`${cardClass} text-[14px] leading-relaxed`}>
          {state.error}
          <FieldErrors fields={state.fields} />
        </p>
      )}
      <div className="flex flex-col gap-2 sm:flex-row">
        <button type="submit" disabled={pending} className={`${primaryClass} sm:flex-1`}>
          {pending ? "Looking…" : "Find my order"}
        </button>
        {accounts && !signedIn && (
          <Link href="/account?next=/account/orders" className={`${secondaryClass} sm:flex-1`}>
            Sign in instead
          </Link>
        )}
      </div>
    </form>
  );
}

// ───────────────────────── the account's own forms ─────────────────────────

export function DetailsForm({ initial }: { initial: { name: string; email: string; phone: string } }) {
  const [state, act, pending] = useActionState(saveDetailsAction, {} as FormState);
  const [confirm, confirmAct, confirming] = useActionState(confirmEmailAction, {} as FormState);
  const verify = state.verify && !confirm.ok ? state.verify : undefined;
  return (
    <div className="space-y-6">
      <form onSubmit={keepValues(act)} className="space-y-4">
        <div>
          <Label htmlFor="details-name">Name</Label>
          <input id="details-name" name="name" defaultValue={initial.name} autoComplete="name" maxLength={120} className={inputClass} />
        </div>
        <div>
          <Label htmlFor="details-email">Email</Label>
          <input id="details-email" name="email" type="email" defaultValue={initial.email} autoComplete="email" required className={inputClass} />
          <p className="mt-1.5 text-[13px] text-[var(--text-muted)]">Change this and we&apos;ll send a code to the new address to make sure it&apos;s yours.</p>
        </div>
        <div>
          <Label htmlFor="details-phone">Phone</Label>
          <input id="details-phone" name="phone" type="tel" defaultValue={initial.phone} autoComplete="tel" maxLength={40} className={inputClass} />
        </div>
        {state.error && (
          <p role="alert" className="text-[14px]">
            {state.error}
            <FieldErrors fields={state.fields} />
          </p>
        )}
        {state.ok && !verify && !confirm.ok && (
          <p role="status" data-testid="details-saved" className="text-[14px]">
            ✓ Saved
          </p>
        )}
        <button type="submit" disabled={pending} className={primaryClass}>
          {pending ? "Saving…" : "Save"}
        </button>
      </form>
      {verify && (
        <form key={verify} action={confirmAct} data-testid="email-verify" className={`${cardClass} space-y-3`}>
          <p className="text-[15px] font-medium">Check {verify}</p>
          <p className="text-[14px] text-[var(--text-body)]">We sent six digits there. Type them in and that becomes your email. Until then, nothing changes.</p>
          {(confirm.devCode ?? state.devCode) && <DevCode code={(confirm.devCode ?? state.devCode)!} />}
          <ConfirmPrev verify={verify} />
          <input name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={9} required aria-label="Code" data-field="code" aria-invalid={confirm.fields?.includes("code") || undefined} className={`${inputClass} font-mono tracking-[4px]`} />
          {confirm.error && (
            <p role="alert" className="text-[14px]">
              {confirm.error}
              <FieldErrors fields={confirm.fields} />
            </p>
          )}
          <button type="submit" disabled={confirming} className={primaryClass}>
            {confirming ? "One moment…" : "Confirm the new email"}
          </button>
        </form>
      )}
      {confirm.ok && (
        <p role="status" data-testid="email-changed" className={`${cardClass} text-[14px]`}>
          {confirm.ok}
        </p>
      )}
    </div>
  );
}

/** The new email the code is for travels with the code (the action checks it against the code, not the account). */
function ConfirmPrev({ verify }: { verify: string }) {
  return <input type="hidden" name="verify" value={verify} />;
}

export function PasswordForm() {
  const [state, act, pending] = useActionState(setPasswordAction, {} as FormState);
  const [show, setShow] = useState(true);
  return (
    <form action={act} className="space-y-4">
      <div>
        <Label htmlFor="new-password">Password</Label>
        <div className="relative">
          <input id="new-password" name="password" type={show ? "text" : "password"} autoComplete="new-password" maxLength={200} required autoFocus aria-invalid={state.fields?.includes("password") || undefined} className={`${inputClass} pr-16`} />
          <button type="button" onClick={() => setShow(!show)} className="absolute inset-y-0 right-3 text-[13.5px] text-[var(--text-muted)]">
            {show ? "Hide" : "Show"}
          </button>
        </div>
        <p className="mt-1.5 text-[13px] text-[var(--text-muted)]">Eight characters or more. Typed once — you can see it, so there&apos;s no second box.</p>
      </div>
      {state.error && (
        <p role="alert" className="text-[14px]">
          {state.error}
          <FieldErrors fields={state.fields} />
        </p>
      )}
      <button type="submit" disabled={pending} className={primaryClass}>
        {pending ? "Saving…" : "Save it"}
      </button>
      <Link href="/account/details" className="block text-center text-[14px] text-[var(--text-muted)] underline-offset-4 hover:underline">
        Not now
      </Link>
    </form>
  );
}

export type AddressValues = { id?: string; label: string; name: string; line1: string; line2: string; city: string; state: string; postcode: string; country: string };

export function AddressForm({ initial, countries, onSaved, onCancel }: { initial: AddressValues; countries: { code: string; name: string }[]; onSaved?: () => void; onCancel?: () => void }) {
  const [state, act, pending] = useActionState(async (prev: FormState, form: FormData) => {
    const r = await saveAddressAction(prev, form);
    if (r.ok) onSaved?.();
    return r;
  }, {} as FormState);
  const field = (name: keyof AddressValues, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div>
      <Label htmlFor={`addr-${name}`}>{label}</Label>
      <input id={`addr-${name}`} name={name} defaultValue={initial[name] ?? ""} className={inputClass} {...props} />
    </div>
  );
  return (
    <form action={act} data-testid="address-form" className="space-y-4">
      {initial.id && <input type="hidden" name="id" value={initial.id} />}
      {field("name", "Name", { autoComplete: "name", required: true, maxLength: 120 })}
      {field("label", "Call it (optional)", { placeholder: "Home, work…", maxLength: 40 })}
      <div>
        <Label htmlFor="addr-country">Country</Label>
        <select id="addr-country" name="country" defaultValue={initial.country} autoComplete="country" className={inputClass}>
          {countries.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      {field("line1", "Street address", { autoComplete: "address-line1", required: true })}
      {field("line2", "Apartment, unit, etc.", { autoComplete: "address-line2" })}
      <div className="grid grid-cols-2 gap-3">
        {field("city", "Town or suburb", { autoComplete: "address-level2", required: true })}
        {field("state", "State", { autoComplete: "address-level1" })}
      </div>
      {field("postcode", "Postcode", { autoComplete: "postal-code", required: true })}
      {state.error && (
        <p role="alert" className="text-[14px]">
          {state.error}
          <FieldErrors fields={state.fields} />
        </p>
      )}
      <div className="flex gap-2">
        <button type="submit" disabled={pending} className={`${primaryClass} flex-1`}>
          {pending ? "Saving…" : "Save address"}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className={`${secondaryClass} w-auto flex-none px-5`}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
