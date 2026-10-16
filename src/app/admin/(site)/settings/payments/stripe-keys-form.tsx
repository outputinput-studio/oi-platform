"use client";

import { useActionState } from "react";
import { saveStripeKeysAction, type PaymentsFormState } from "@/modules/payments/actions";
import { Button, Field, Input, Notice } from "../../../ui";

/** The two keys. Password boxes, never filled back in: what's saved stays out of the page. */
export function StripeKeysForm({ hasKeys }: { hasKeys: boolean }) {
  const [state, act, pending] = useActionState(saveStripeKeysAction, {} as PaymentsFormState);
  return (
    <form action={act} className="space-y-4" autoComplete="off">
      <Field label="Secret key" htmlFor="stripe-secret" hint="Starts rk_live_ or sk_live_ (rk_test_ / sk_test_ while you're testing).">
        <Input id="stripe-secret" name="secretKey" type="password" required autoComplete="off" spellCheck={false} className="font-mono" />
      </Field>
      <Field label="Webhook signing secret" htmlFor="stripe-webhook" hint={hasKeys ? "Starts whsec_. Leave empty to keep the one you saved before." : "Starts whsec_. Optional, but without it a paid order can be missed if the customer closes the page."}>
        <Input id="stripe-webhook" name="webhookSecret" type="password" autoComplete="off" spellCheck={false} className="font-mono" />
      </Field>
      <Notice {...state} />
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Checking with Stripe…" : "Save keys"}
      </Button>
    </form>
  );
}
