"use client";

import { useActionState } from "react";
import { manageBillingAction, startPayingAction, type BillingFormState } from "@/modules/billing/actions";
import { Button, Notice } from "../../../ui";

/** "Set up payment": off to Stripe's page to add a card (or, with test billing, straight back). */
export function StartPaying() {
  const [state, act, pending] = useActionState<BillingFormState>(startPayingAction, {});
  return (
    <form action={act} className="space-y-2">
      <Button type="submit" disabled={pending}>
        {pending ? "One moment…" : "Set up payment"}
      </Button>
      <Notice error={state.error} />
    </form>
  );
}

/** "Card and invoices": Stripe's page for changing the card and downloading invoices. */
export function ManageBilling({ label = "Card and invoices" }: { label?: string }) {
  const [state, act, pending] = useActionState<BillingFormState>(manageBillingAction, {});
  return (
    <form action={act} className="space-y-2">
      <Button type="submit" variant="secondary" size="sm" disabled={pending}>
        {pending ? "One moment…" : label}
      </Button>
      <Notice error={state.error} />
    </form>
  );
}
