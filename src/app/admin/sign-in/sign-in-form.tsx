"use client";

import { useActionState } from "react";
import { sendCode, verifyCode, type SignInState } from "@/modules/auth/actions";
import { Button, Input, Notice } from "../ui";
import { keepValues } from "../../keep-values";

/** What a sign-in error is about, for outlining it. */
const CODE = ["code"];
const EMAIL = ["email"];

/**
 * Two steps on one screen: email, then the six-digit code. State lives in
 * the server action's return value, so a refresh never loses the step and
 * there is nothing to hydrate but the form itself.
 */
export function SignInForm({ email = "" }: { email?: string }) {
  const [state, act, pending] = useActionState(
    (prev: SignInState, form: FormData) => (prev.step === "code" ? verifyCode(prev, form) : sendCode(prev, form)),
    { step: "email" } as SignInState,
  );

  if (state.step === "code") {
    return (
      <form onSubmit={keepValues(act)} className="space-y-5">
        <input type="hidden" name="email" value={state.email} />
        <p className="text-[13.5px] leading-relaxed text-muted">
          If <span className="text-text">{state.email}</span> belongs to a site, a code is on its way. Didn&apos;t get one? Check
          the address, or ask the site owner to add you.
        </p>
        {state.devCode && (
          <p className="rounded-card border border-dashed border-line p-3 text-[13px]">
            <span className="text-muted">Not production, no email provider — your code is </span>
            <code data-testid="dev-code" className="font-mono text-[15px] tracking-[3px] text-text">
              {state.devCode}
            </code>
          </p>
        )}
        <div>
          <label htmlFor="field-code" className="label mb-2 block">
            Code
          </label>
          <Input id="field-code" name="code" type="text" inputMode="numeric" pattern="[0-9]{6}" autoComplete="one-time-code" required autoFocus className="font-mono tracking-[3px]" />
        </div>
        {state.error && <Notice error={state.error} fields={CODE} />}
        <Button type="submit" disabled={pending} className="h-12 w-full text-[16px]">
          {pending ? "One moment…" : "Sign in"}
        </Button>
        <p className="text-center text-[14px]">
          <a href="/sign-in" className="text-body underline-offset-4 hover:underline">
            Use a different email
          </a>
        </p>
      </form>
    );
  }

  return (
    <form onSubmit={keepValues(act)} className="space-y-5">
      <div>
        <label htmlFor="field-email" className="label mb-2 block">
          Email
        </label>
        <Input id="field-email" name="email" type="email" inputMode="email" autoComplete="email" required autoFocus defaultValue={email} />
      </div>
      {state.error && <Notice error={state.error} fields={EMAIL} />}
      <Button type="submit" disabled={pending} className="h-12 w-full text-[16px]">
        {pending ? "One moment…" : "Send code"}
      </Button>
    </form>
  );
}
