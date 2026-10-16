"use client";

import { useActionState, useState } from "react";
import { updateSendingAction, type SettingsFormState } from "@/modules/sites/actions";
import type { Sending } from "@/modules/sites/business";
import { Field, Input, Label, SaveBar } from "../../../ui";

/** Where your email comes from, as in design/admin.html. */
export function SendingForm({
  initial,
  fallbackName,
  fallbackReply,
  address,
  own,
  now,
  canEdit,
}: {
  initial: Sending;
  fallbackName: string;
  fallbackReply: string;
  /** The platform's sending address, until the site's own domain sends. */
  address: string;
  /** Sending from their own verified domain. */
  own: boolean;
  now: { fromName: string; replyTo?: string };
  canEdit: boolean;
}) {
  const [saved, setSaved] = useState(initial);
  const [v, setV] = useState(initial);
  const [state, act, pending] = useActionState(async (prev: SettingsFormState, form: FormData) => {
    const r = await updateSendingAction(prev, form);
    if (r.ok) setSaved(v);
    return r;
  }, {} as SettingsFormState);
  const dirty = JSON.stringify(v) !== JSON.stringify(saved);
  const replyNow = v.replyTo || fallbackReply;

  return (
    <form action={act} className="space-y-5">
      <Label>Where your email comes from</Label>
      <Field label="Shown as from" htmlFor="s-from" hint={`What customers see in their inbox. Empty uses "${fallbackName}".`}>
        <Input id="s-from" name="fromName" value={v.fromName} maxLength={80} placeholder={fallbackName} readOnly={!canEdit} onChange={(e) => setV({ ...v, fromName: e.target.value })} />
      </Field>
      <Field label="Replies go to" htmlFor="s-reply" hint={fallbackReply ? `When a customer hits reply. Empty uses your business email, ${fallbackReply}.` : "When a customer hits reply. Fill this in (or your business email) so replies reach you."}>
        <Input id="s-reply" name="replyTo" type="email" value={v.replyTo} maxLength={200} placeholder={fallbackReply} readOnly={!canEdit} onChange={(e) => setV({ ...v, replyTo: e.target.value })} />
      </Field>
      {!replyNow && (
        <p data-testid="no-reply-to" className="text-[12.5px] leading-[1.5] text-warning">
          With no reply address, a customer replying to an order email won&apos;t reach you.
        </p>
      )}
      <div>
        <Label>Sending address</Label>
        <div className="rounded-card border border-line bg-surface px-4 py-3">
          <p className="font-mono text-[13.5px]">{address || "Not set up here"}</p>
          <p className="mt-1 text-[12.5px] leading-[1.5] text-muted">
            {own ? "Emails leave from your own domain" : "Emails leave from output/input's address"} with your name on them: right now, <span className="text-body">{now.fromName}</span>
            {now.replyTo ? `, replies to ${now.replyTo}` : ""}.{own ? "" : " To send from your own domain, set it up below."}
          </p>
        </div>
      </div>
      {canEdit ? <SaveBar dirty={dirty} pending={pending} state={state} /> : <p className="text-[13px] text-muted">Only an owner can change this.</p>}
    </form>
  );
}
