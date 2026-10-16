"use client";

import { useState, useTransition } from "react";
import { saveMessagesAction, sendTestEmailAction, type SettingsFormState } from "@/modules/sites/actions";
import { DEFAULT_TEMPLATES, FILL_INS, TEMPLATE_KEYS, type Template, type TemplateKey } from "@/modules/sites/messages";
import { Button, Field, Input, Label, Notice, Switch, Textarea } from "../../../ui";

type State = { keepCopy: boolean; templates: Record<TemplateKey, Template> };

/**
 * The four order emails, each with its subject, message, fill-ins, a test
 * to yourself and a way back to the default. Saved with one button.
 */
export function EmailsEditor({
  initial,
  stageNames,
  copyTo,
  me,
  canEdit,
}: {
  initial: State;
  stageNames: { inProgress: string; sent: string; done: string };
  /** Where "keep a copy" sends it: the reply address (Settings · Sending or the business email). */
  copyTo: string;
  me: string;
  canEdit: boolean;
}) {
  const [v, setV] = useState(initial);
  const [saved, setSaved] = useState(JSON.stringify(initial));
  const [state, setState] = useState<SettingsFormState>({});
  const [pending, start] = useTransition();
  const dirty = JSON.stringify(v) !== saved;
  const setT = (k: TemplateKey, patch: Partial<Template>) => setV((cur) => ({ ...cur, templates: { ...cur.templates, [k]: { ...cur.templates[k], ...patch } } }));
  const title: Record<TemplateKey, [string, string]> = {
    confirmed: ["Order confirmed", "Goes the moment they pay. Your receipt is always added, with the tax-invoice lines when you have a business number."],
    inProgress: [stageNames.inProgress, `Drafted when you mark an order ${stageNames.inProgress.toLowerCase()}. You can change it before it goes.`],
    sent: [stageNames.sent, `Drafted when you mark an order ${stageNames.sent.toLowerCase()}, with the tracking number if you add one.`],
    done: [stageNames.done, `Drafted when you mark an order ${stageNames.done.toLowerCase()}. Off by default on the order; switch it on to send.`],
  };

  const save = () =>
    start(async () => {
      const r: SettingsFormState = await saveMessagesAction({ keepCopy: v.keepCopy, templates: v.templates }).catch(() => ({ error: "Couldn't reach the server. Try again." }));
      setState(r);
      if (r.ok) setSaved(JSON.stringify(v));
    });

  return (
    <div className="space-y-6">
      <p className="text-[14px] leading-[1.55] text-body">These go to customers as their order moves along. The ones you send from an order can be changed there before they go.</p>
      <div className="rounded-card border border-line bg-surface p-4">
        <Switch
          checked={v.keepCopy}
          disabled={!canEdit}
          onChange={(keepCopy) => setV({ ...v, keepCopy })}
          label="Keep a copy of these"
          hint={copyTo ? `Every email to a customer is blind copied to ${copyTo}, so you can see exactly what they got.` : "Every email to a customer is blind copied to you. Needs a reply address: your business email, or Settings · Sending."}
        />
      </div>
      {TEMPLATE_KEYS.map((k) => (
        <TemplateCard key={k} k={k} title={title[k][0]} hint={title[k][1]} t={v.templates[k]} canEdit={canEdit} me={me} onChange={(patch) => setT(k, patch)} />
      ))}
      {canEdit ? (
        <div className="space-y-2">
          <Notice {...state} />
          <Button type="button" className="w-full" disabled={!dirty || pending} onClick={save}>
            {pending ? "Saving…" : dirty ? "Save emails" : "Saved"}
          </Button>
        </div>
      ) : (
        <p className="text-[13px] text-muted">Only an owner can change these.</p>
      )}
    </div>
  );
}

function TemplateCard({ k, title, hint, t, canEdit, me, onChange }: { k: TemplateKey; title: string; hint: string; t: Template; canEdit: boolean; me: string; onChange: (patch: Partial<Template>) => void }) {
  const [test, setTest] = useState<SettingsFormState>({});
  const [sending, start] = useTransition();
  const isDefault = t.subject === DEFAULT_TEMPLATES[k].subject && t.body === DEFAULT_TEMPLATES[k].body;
  return (
    <section data-testid={`template-${k}`} className="space-y-3 rounded-card border border-line bg-surface p-4">
      <div>
        <Label>{title}</Label>
        <p className="-mt-1 text-[12.5px] leading-[1.5] text-muted">{hint}</p>
      </div>
      <Field label="Subject" htmlFor={`t-${k}-subject`}>
        <Input id={`t-${k}-subject`} value={t.subject} maxLength={200} readOnly={!canEdit} onChange={(e) => onChange({ subject: e.target.value })} />
      </Field>
      <Field label="Message" htmlFor={`t-${k}-body`} hint={`Fill-ins: ${FILL_INS[k].join(" ")}`}>
        <Textarea id={`t-${k}-body`} value={t.body} rows={8} maxLength={5000} readOnly={!canEdit} onChange={(e) => onChange({ body: e.target.value })} />
      </Field>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={sending}
          onClick={() =>
            start(async () => {
              setTest(await sendTestEmailAction(k, t).catch(() => ({ error: "Couldn't reach the server. Try again." })));
            })
          }
        >
          {sending ? "Sending…" : "Send me a test"}
        </Button>
        {canEdit && !isDefault && (
          <Button type="button" variant="quiet" size="sm" onClick={() => onChange(DEFAULT_TEMPLATES[k])}>
            Back to the default
          </Button>
        )}
      </div>
      <Notice {...test} />
      {!test.ok && !test.error && <p className="text-[12px] text-faint">A test goes to {me}, filled in with a sample order.</p>}
    </section>
  );
}
