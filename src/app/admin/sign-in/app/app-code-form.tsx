"use client";

import { useActionState, useState } from "react";
import { verifyAppCode, type AppCodeState } from "@/modules/auth/actions";
import { Button, Input, Notice } from "../../ui";
import { keepValues } from "../../../keep-values";

/** The app's six digits, or a recovery code when the phone isn't to hand. */
export function AppCodeForm() {
  const [state, act, pending] = useActionState(verifyAppCode, {} as AppCodeState);
  const [recovery, setRecovery] = useState(false);
  return (
    <form onSubmit={keepValues(act)} className="space-y-5">
      <div>
        <label htmlFor="field-app-code" className="label mb-2 block">
          {recovery ? "Recovery code" : "Code from your app"}
        </label>
        <Input
          key={recovery ? "recovery" : "app"}
          id="field-app-code"
          name="code"
          type="text"
          inputMode={recovery ? "text" : "numeric"}
          autoComplete={recovery ? "off" : "one-time-code"}
          autoCapitalize="off"
          spellCheck={false}
          placeholder={recovery ? "abcd-efgh" : undefined}
          required
          autoFocus
          className="font-mono tracking-[3px]"
        />
        {recovery && <p className="mt-2 text-[12.5px] leading-relaxed text-muted">One of the ten you saved when you set the app up. Each works once.</p>}
      </div>
      <Notice error={state.error} fields={state.fields} />
      <Button type="submit" disabled={pending} className="h-12 w-full text-[16px]">
        {pending ? "One moment…" : "Sign in"}
      </Button>
      <p className="text-center text-[14px]">
        <button type="button" onClick={() => setRecovery(!recovery)} className="text-body underline-offset-4 hover:underline">
          {recovery ? "Use the app instead" : "Use a recovery code instead"}
        </button>
      </p>
      <p className="text-center text-[12.5px] leading-relaxed text-faint">Lost your phone and your recovery codes? Ask an Owner of your site to reset it, or ask us.</p>
    </form>
  );
}
