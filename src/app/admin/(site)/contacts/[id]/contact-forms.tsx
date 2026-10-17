"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { addNoteAction, saveContactAction, type FormState } from "@/modules/contacts/actions";
import type { ContactDetails } from "@/modules/contacts/server";
import { Button, Card, Field, Input, Label, Notice, Textarea } from "../../../ui";
import { FieldErrors } from "@/lib/field-errors";
import { keepValues } from "../../../../keep-values";

/** Name, email, phone: changes save as you type. */
export function ContactDetailsForm({ contactId, initial }: { contactId: string; initial: ContactDetails }) {
  const [d, setD] = useState(initial);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState("");
  const [fields, setFields] = useState<string[]>();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const save = async (snapshot: ContactDetails) => {
    setStatus("saving");
    const r = await saveContactAction(contactId, snapshot).catch(() => ({ error: "couldn't reach the server" }));
    if (r.error) {
      setError(r.error);
      setFields("fields" in r ? r.fields : undefined);
      setStatus("error");
    } else setStatus("saved");
  };
  const change = (patch: Partial<ContactDetails>) => {
    const next = { ...d, ...patch };
    setD(next);
    setStatus("idle");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void save(next), 700);
  };
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  return (
    <div className="space-y-4 rounded-card border border-line bg-surface p-4">
      <Field label="Name" htmlFor="c-name">
        <Input id="c-name" data-field="name" value={d.name} maxLength={120} onChange={(e) => change({ name: e.target.value })} />
      </Field>
      <Field label="Email" htmlFor="c-email">
        <Input id="c-email" data-field="email" type="email" inputMode="email" value={d.email} maxLength={200} autoComplete="off" onChange={(e) => change({ email: e.target.value })} />
      </Field>
      <Field label="Phone" htmlFor="c-phone">
        <Input id="c-phone" data-field="phone" type="tel" inputMode="tel" value={d.phone} maxLength={40} autoComplete="off" onChange={(e) => change({ phone: e.target.value })} />
      </Field>
      <p className="text-right text-[12px] text-muted" aria-live="polite" data-testid="contact-save-status">
        {status === "idle" && "Changes save as you type."}
        {status === "saving" && "Saving…"}
        {status === "saved" && "Saved"}
        {status === "error" && (
          <button type="button" onClick={() => void save(d)} className="text-alert underline underline-offset-4">
            Retry — {error}
          </button>
        )}
        {status === "error" && <FieldErrors fields={fields} />}
      </p>
    </div>
  );
}

/** The team's own notes on a person, newest first, with a box to add one. */
export function Notes({ contactId, notes }: { contactId: string; notes: { at: string; text: string }[] }) {
  const [open, setOpen] = useState(false);
  // Wrapping the action lets the box close on success without an effect.
  const [state, act, pending] = useActionState(async (prev: FormState, form: FormData) => {
    const r = await addNoteAction(prev, form);
    if (r.ok) setOpen(false);
    return r;
  }, {} as FormState);
  return (
    <>
      <Label className="mt-8" right={!open ? <button type="button" onClick={() => setOpen(true)} className="text-accent-text">Add note</button> : undefined}>
        Notes
      </Label>
      {open && (
        <form onSubmit={keepValues(act)} className="mb-3 space-y-3 rounded-card border border-line bg-surface p-4">
          <input type="hidden" name="contactId" value={contactId} />
          <Textarea name="text" aria-label="Note" rows={3} maxLength={2000} required autoFocus placeholder="Only you and your team see this." />
          <Notice error={state.error} fields={state.fields} />
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? "Adding…" : "Add note"}
            </Button>
            <Button type="button" size="sm" variant="quiet" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </form>
      )}
      {notes.length === 0 ? (
        <Card variant="static" className="px-4 py-5 text-[13.5px] text-muted">
          No notes yet. Anything you write here is only for you and your team.
        </Card>
      ) : (
        <Card className="divide-y divide-line-soft">
          {[...notes].reverse().map((n, i) => (
            <div key={i} className="px-4 py-3.5">
              <p className="text-[12px] text-muted">{new Date(n.at).toLocaleString("en-AU", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" })}</p>
              <p className="mt-1 whitespace-pre-wrap text-[14.5px] text-text">{n.text}</p>
            </div>
          ))}
        </Card>
      )}
    </>
  );
}
