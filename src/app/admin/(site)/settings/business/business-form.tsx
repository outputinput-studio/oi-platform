"use client";

import { useActionState, useState } from "react";
import { updateBusinessAction, type SettingsFormState } from "@/modules/sites/actions";
import type { Business } from "@/modules/sites/business";
import { Field, Input, SaveBar, Textarea } from "../../../ui";

/** Who the business is. Each field says where it shows, so nothing turns up somewhere unexpected. */
export function BusinessForm({ initial, siteName, canEdit }: { initial: Business; siteName: string; canEdit: boolean }) {
  const [saved, setSaved] = useState(initial);
  const [v, setV] = useState(initial);
  const [state, act, pending] = useActionState(async (prev: SettingsFormState, form: FormData) => {
    const r = await updateBusinessAction(prev, form);
    if (r.ok) setSaved(v);
    return r;
  }, {} as SettingsFormState);
  const dirty = JSON.stringify(v) !== JSON.stringify(saved);
  const set = (k: keyof Business) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setV({ ...v, [k]: e.target.value });

  return (
    <form action={act} className="space-y-5">
      <Field label="Trading name" htmlFor="b-name" hint={`The name customers know. Signs your emails and receipts. Empty uses "${siteName}".`}>
        <Input id="b-name" name="tradingName" value={v.tradingName} maxLength={120} readOnly={!canEdit} placeholder={siteName} onChange={set("tradingName")} />
      </Field>
      <Field label="Business number" htmlFor="b-number" hint="As you'd like it printed on receipts: ABN 48 219 774 301, or your tax ID. With it, order confirmations work as tax invoices.">
        <Input id="b-number" name="businessNumber" value={v.businessNumber} maxLength={60} readOnly={!canEdit} className="font-mono" onChange={set("businessNumber")} />
      </Field>
      <div className="grid gap-5 md:grid-cols-2">
        <Field label="Phone" htmlFor="b-phone">
          <Input id="b-phone" name="phone" type="tel" value={v.phone} maxLength={40} readOnly={!canEdit} onChange={set("phone")} />
        </Field>
        <Field label="Email" htmlFor="b-email" hint="Customer replies come here unless Settings · Sending says otherwise.">
          <Input id="b-email" name="email" type="email" value={v.email} maxLength={200} readOnly={!canEdit} onChange={set("email")} />
        </Field>
      </div>
      <Field label="Address" htmlFor="b-address" hint="Where you are. Pickup orders show it, with your hours.">
        <Textarea id="b-address" name="address" rows={3} value={v.address} maxLength={400} readOnly={!canEdit} onChange={set("address")} />
      </Field>
      <Field label="Hours" htmlFor="b-hours">
        <Input id="b-hours" name="hours" value={v.hours} maxLength={120} placeholder="By appointment, Tue–Sat" readOnly={!canEdit} onChange={set("hours")} />
      </Field>
      <p className="rounded-card border border-line bg-surface px-4 py-3 text-[12.5px] leading-[1.55] text-muted">
        Your trading name, phone, email and address are also given to Google on your home page, so it can show them in search. Leave out anything you don&apos;t want public.
      </p>
      {canEdit ? <SaveBar dirty={dirty} pending={pending} state={state} /> : <p className="text-[13px] text-muted">Only an owner can change this.</p>}
    </form>
  );
}
