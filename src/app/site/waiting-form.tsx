"use client";

import { useActionState, useState } from "react";
import { joinWaitingAction, type WaitingState } from "@/modules/waiting/actions";
import { FieldErrors } from "@/lib/field-errors";
import { INVALID } from "./storefront-form";

/**
 * "Email me when it's back" on a sold-out product (or the combination
 * picked): a button that opens to one email box. One email when it's back,
 * nothing before.
 */
export function WaitingForm({ productId, variant = "", what }: { productId: string; variant?: string; what?: string }) {
  const [open, setOpen] = useState(false);
  const [state, act, pending] = useActionState(joinWaitingAction.bind(null, productId, variant), {} as WaitingState);

  if (state.ok)
    return (
      <p role="status" data-testid="waiting-done" className="mt-4 text-[14px] text-[var(--text-body)]">
        {state.ok}
      </p>
    );
  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className="mt-4 h-12 rounded-[6px] border border-[var(--border)] px-6 text-[15px] font-medium hover:border-[var(--text-muted)]">
        Email me when it&apos;s back
      </button>
    );
  return (
    <form action={act} data-testid="waiting-form" className="mt-4 max-w-sm space-y-2">
      <label htmlFor={`waiting-${productId}`} className="block text-[14px]">
        {what ? `We'll let you know when ${what} is back.` : "We'll let you know when it's back."}
      </label>
      <div className="flex gap-2">
        <input
          id={`waiting-${productId}`}
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@example.com"
          className={`block h-12 min-w-0 flex-1 rounded-[6px] border border-[var(--border)] bg-transparent px-3.5 text-[16px] outline-none focus:border-[var(--accent)] ${INVALID}`}
        />
        <button type="submit" disabled={pending} className="h-12 flex-none rounded-[6px] bg-[var(--accent)] px-5 text-[15px] font-medium text-[var(--accent-fg)] hover:opacity-90 disabled:opacity-60">
          {pending ? "…" : "Let me know"}
        </button>
      </div>
      {/* The trap: people never see it, bots fill it in. */}
      <div className="absolute -left-[9999px] top-auto h-px w-px overflow-hidden" aria-hidden>
        <label htmlFor={`website_waiting_${productId}`}>Website</label>
        <input id={`website_waiting_${productId}`} name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>
      <p className="text-[12.5px] text-[var(--text-muted)]">One email when it&apos;s back. Nothing else.</p>
      {state.error && (
        <p role="alert" className="text-[14px] text-[var(--text-muted)]">
          {state.error}
          <FieldErrors fields={state.fields} />
        </p>
      )}
    </form>
  );
}
