"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { saveFooterAction, type SettingsFormState } from "@/modules/sites/actions";
import { SOCIAL_NETWORKS, type SocialNetwork } from "@/modules/sites/search";
import { Button, Field, Input, Label, Notice } from "../../../ui";

type State = { newsletterFormId: string | null; newsletterHeading: string; social: Record<SocialNetwork, string> };

/** What sits at the foot of every page: a form (usually a newsletter signup) and the social links. */
export function FooterForm({ initial, forms, canEdit }: { initial: State; forms: { id: string; name: string; fields: number; createContact: boolean }[]; canEdit: boolean }) {
  const [v, setV] = useState(initial);
  const [saved, setSaved] = useState(JSON.stringify(initial));
  const [state, setState] = useState<SettingsFormState>({});
  const [pending, start] = useTransition();
  const dirty = JSON.stringify(v) !== saved;
  const options: { id: string | null; name: string; hint: string }[] = [
    ...forms.map((f) => ({ id: f.id, name: f.name, hint: `${f.fields} field${f.fields === 1 ? "" : "s"}${f.createContact ? "" : " · no contact created"}` })),
    { id: null, name: "None", hint: "No form in the footer." },
  ];

  const save = () =>
    start(async () => {
      const r: SettingsFormState = await saveFooterAction({ footer: { newsletterFormId: v.newsletterFormId, newsletterHeading: v.newsletterHeading }, social: v.social }).catch(() => ({ error: "Couldn't reach the server. Try again." }));
      setState(r);
      if (r.ok) setSaved(JSON.stringify(v));
    });

  return (
    <div className="space-y-7">
      <section>
        <Label>Newsletter in the footer</Label>
        <p className="-mt-1 mb-3 text-[12.5px] leading-[1.5] text-muted">The footer sits on every page, so its form is picked here rather than on a page.</p>
        <div role="radiogroup" aria-label="Footer form" className="space-y-2">
          {options.map((o) => {
            const on = v.newsletterFormId === o.id;
            return (
              <button
                key={o.id ?? "none"}
                type="button"
                role="radio"
                aria-checked={on}
                disabled={!canEdit}
                onClick={() => setV({ ...v, newsletterFormId: o.id })}
                className={`flex w-full items-start gap-3 rounded-card border px-4 py-3 text-left disabled:cursor-default ${on ? "border-accent bg-selected" : "border-line bg-surface hover:bg-hover"}`}
              >
                <span className={`mt-[3px] flex h-4 w-4 flex-none items-center justify-center rounded-full border ${on ? "border-accent" : "border-control"}`}>{on && <span className="h-2 w-2 rounded-full bg-accent" />}</span>
                <span>
                  <span className="block text-[14.5px]">{o.name}</span>
                  <span className="block text-[12.5px] text-muted">{o.hint}</span>
                </span>
              </button>
            );
          })}
        </div>
        {v.newsletterFormId && (
          <div className="mt-3">
          <Field label="Heading above it" htmlFor="footer-heading" hint="Optional. Something like “Join the list”.">
            <Input id="footer-heading" value={v.newsletterHeading} maxLength={80} readOnly={!canEdit} onChange={(e) => setV({ ...v, newsletterHeading: e.target.value })} />
          </Field>
          </div>
        )}
      </section>

      <section>
        <Label>Social links</Label>
        <p className="-mt-1 mb-3 text-[12.5px] leading-[1.5] text-muted">Shown in the footer, and given to Google as your other homes. Leave any you don&apos;t use empty.</p>
        <div className="space-y-3">
          {SOCIAL_NETWORKS.map(([k, name, example]) => (
            <Field key={k} label={name} htmlFor={`social-${k}`}>
              <Input id={`social-${k}`} type="url" value={v.social[k]} maxLength={300} placeholder={example} readOnly={!canEdit} onChange={(e) => setV({ ...v, social: { ...v.social, [k]: e.target.value } })} />
            </Field>
          ))}
        </div>
      </section>

      <p className="text-[13px] text-muted">
        The footer&apos;s columns of links are in{" "}
        <Link href="/menus" className="underline underline-offset-2">
          Content · Menus
        </Link>
        .
      </p>

      {canEdit ? (
        <div className="space-y-2">
          <Notice {...state} />
          <Button type="button" className="w-full" disabled={!dirty || pending} onClick={save}>
            {pending ? "Saving…" : dirty ? "Save footer" : "Saved"}
          </Button>
        </div>
      ) : (
        <p className="text-[13px] text-muted">Only an owner can change this.</p>
      )}
    </div>
  );
}
