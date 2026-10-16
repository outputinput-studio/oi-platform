"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { saveMessagesAction, type SettingsFormState } from "@/modules/sites/actions";
import type { NotifyEvent, Recipients } from "@/modules/sites/messages";
import { Button, Field, Input, Label, Notice, Switch } from "../../../ui";

type FormRow = Recipients & { id: string; name: string };
type State = { notify: Record<NotifyEvent, Recipients>; forms: FormRow[] };

const EVENTS: [NotifyEvent, string, string][] = [
  ["newOrder", "A new order", "As soon as someone pays."],
  ["lowStock", "Running low", "A ready-to-ship product drops to its last one or two, or sells out."],
  ["paymentFailed", "A payment didn't go through", "A bank payment that was still going through gets declined."],
];

/** The emails that come to the team, not the ones customers get. Each can go somewhere different, or nowhere. */
export function NotifyEditor({ initial, canEdit }: { initial: State; canEdit: boolean }) {
  const [v, setV] = useState(initial);
  const [saved, setSaved] = useState(JSON.stringify(initial));
  const [state, setState] = useState<SettingsFormState>({});
  const [pending, start] = useTransition();
  const dirty = JSON.stringify(v) !== saved;

  const save = () =>
    start(async () => {
      const r: SettingsFormState = await saveMessagesAction({ notify: v.notify, forms: v.forms.map(({ id, on, to, cc, bcc }) => ({ id, on, to, cc, bcc })) }).catch(() => ({ error: "Couldn't reach the server. Try again." }));
      setState(r);
      if (r.ok) setSaved(JSON.stringify(v));
    });

  return (
    <div className="space-y-6">
      <p className="text-[14px] leading-[1.55] text-body">
        These are the emails that come to you, not the ones customers get (those are in{" "}
        <Link href="/settings/emails" className="underline underline-offset-2">
          Customer emails
        </Link>
        ). Leave &ldquo;Goes to&rdquo; empty and it goes to the site&apos;s owners.
      </p>
      <section className="space-y-3">
        <Label>Orders and stock</Label>
        {EVENTS.map(([k, title, hint]) => (
          <RecipientsCard key={k} id={k} title={title} hint={hint} r={v.notify[k]} canEdit={canEdit} onChange={(patch) => setV((cur) => ({ ...cur, notify: { ...cur.notify, [k]: { ...cur.notify[k], ...patch } } }))} />
        ))}
      </section>
      {v.forms.length > 0 && (
        <section className="space-y-3">
          <Label>Forms</Label>
          {v.forms.map((f) => (
            <RecipientsCard
              key={f.id}
              id={`form-${f.id}`}
              title={f.name}
              hint={`From the ${f.name} form. Off, it still lands in your Inbox.`}
              r={f}
              canEdit={canEdit}
              onChange={(patch) => setV((cur) => ({ ...cur, forms: cur.forms.map((x) => (x.id === f.id ? { ...x, ...patch } : x)) }))}
            />
          ))}
          <p className="text-[12.5px] text-muted">Each form can go somewhere different — handy once someone helps you with the admin.</p>
        </section>
      )}
      {canEdit ? (
        <div className="space-y-2">
          <Notice {...state} />
          <Button type="button" className="w-full" disabled={!dirty || pending} onClick={save}>
            {pending ? "Saving…" : dirty ? "Save" : "Saved"}
          </Button>
        </div>
      ) : (
        <p className="text-[13px] text-muted">Only an owner can change these.</p>
      )}
    </div>
  );
}

function RecipientsCard({ id, title, hint, r, canEdit, onChange }: { id: string; title: string; hint: string; r: Recipients; canEdit: boolean; onChange: (patch: Partial<Recipients>) => void }) {
  const [copy, setCopy] = useState(Boolean(r.cc || r.bcc));
  return (
    <div data-testid={`notify-${id}`} className="space-y-3 rounded-card border border-line bg-surface p-4">
      <Switch checked={r.on} disabled={!canEdit} onChange={(on) => onChange({ on })} label={title} hint={hint} />
      {r.on && (
        <>
          <Field label="Goes to" htmlFor={`${id}-to`}>
            <Input id={`${id}-to`} value={r.to} maxLength={600} placeholder="The site's owners" readOnly={!canEdit} onChange={(e) => onChange({ to: e.target.value })} />
          </Field>
          {copy ? (
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="CC" htmlFor={`${id}-cc`}>
                <Input id={`${id}-cc`} value={r.cc} maxLength={600} readOnly={!canEdit} onChange={(e) => onChange({ cc: e.target.value })} />
              </Field>
              <Field label="BCC" htmlFor={`${id}-bcc`}>
                <Input id={`${id}-bcc`} value={r.bcc} maxLength={600} readOnly={!canEdit} onChange={(e) => onChange({ bcc: e.target.value })} />
              </Field>
            </div>
          ) : (
            canEdit && (
              <button type="button" onClick={() => setCopy(true)} className="text-[13.5px] text-accent-text hover:underline">
                Copy someone else in
              </button>
            )
          )}
          <p className="text-[12px] text-muted">Separate addresses with commas.</p>
        </>
      )}
    </div>
  );
}
