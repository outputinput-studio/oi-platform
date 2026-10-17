"use client";

import { useActionState } from "react";
import { confirmTwoFactorAction, type AccountState } from "@/modules/auth/account-actions";
import { Button, Input, Notice } from "../ui";
import { RecoveryCodes } from "../recovery-codes";
import { keepValues } from "../../keep-values";

/** The first code from the app turns it on; then the recovery codes, then on to wherever they were going. */
export function SetupForm({ next }: { next: string }) {
  const [state, act, pending] = useActionState(confirmTwoFactorAction, {} as AccountState);
  if (state.codes) {
    return (
      <div className="mt-3 space-y-6">
        <p data-testid="two-factor-on" className="rounded-card border border-success bg-success-bg px-4 py-3 text-[14px] text-success">
          It&apos;s on. Next time you sign in, we&apos;ll ask for the code from your app.
        </p>
        <RecoveryCodes codes={state.codes} />
        <a href={next} className="flex h-12 w-full items-center justify-center rounded-button bg-accent text-[16px] font-medium text-text hover:bg-accent-hover">
          I&apos;ve saved them
        </a>
      </div>
    );
  }
  return (
    <form onSubmit={keepValues(act)} className="mt-3 space-y-4">
      <label htmlFor="field-setup-code" className="sr-only">
        Code from your app
      </label>
      <Input id="field-setup-code" name="code" type="text" inputMode="numeric" pattern="[0-9 ]{6,7}" autoComplete="one-time-code" required className="font-mono tracking-[3px]" />
      <Notice error={state.error} fields={state.fields} />
      <Button type="submit" disabled={pending} className="h-12 w-full text-[16px]">
        {pending ? "Checking…" : "Turn it on"}
      </Button>
    </form>
  );
}
