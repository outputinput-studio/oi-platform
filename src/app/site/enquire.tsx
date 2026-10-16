"use client";

import { useState } from "react";
import type { Field } from "@/modules/forms/fields";
import { StorefrontForm } from "./storefront-form";

/**
 * "Enquire about this" on a product the cart can't take: an enquire-only
 * product gets the main button, a sold one a quieter "something like
 * this". Opens the site's enquiry form in place; the product goes along
 * by id, and the server names it in the submission.
 */
export function Enquire({ form, productId, sold }: { form: { id: string; fields: Field[]; buttonText: string; afterMessage: string }; productId: string; sold: boolean }) {
  const [open, setOpen] = useState(false);
  if (open)
    return (
      <div data-testid="enquiry" className="mt-6 border-t border-[var(--border-soft)] pt-6">
        <h2 className="mb-4 text-[18px] font-medium">{sold ? "Ask about something like this" : "Ask about this"}</h2>
        <StorefrontForm form={form} about={productId} />
      </div>
    );
  return sold ? (
    <button type="button" onClick={() => setOpen(true)} className="mt-5 text-[15px] underline underline-offset-4 hover:opacity-80">
      Want something like this? Enquire
    </button>
  ) : (
    <button type="button" onClick={() => setOpen(true)} className="mt-5 h-12 w-full rounded-[6px] bg-[var(--accent)] text-[15px] font-medium text-[var(--accent-fg)] hover:opacity-90">
      Enquire about this
    </button>
  );
}
