"use client";

import { useState, useTransition } from "react";
import { saveEnquiryFormAction, type SettingsFormState } from "@/modules/sites/actions";
import { Button, Notice } from "../../../ui";

/** Pick the enquiry form from the site's forms, or none. Radio cards, as Availability is drawn on a product. */
export function EnquiryFormPicker({ forms, initial, canEdit }: { forms: { id: string; name: string; fields: number }[]; initial: string | null; canEdit: boolean }) {
  const [picked, setPicked] = useState<string | null>(initial);
  const [saved, setSaved] = useState<string | null>(initial);
  const [state, setState] = useState<SettingsFormState>({});
  const [pending, start] = useTransition();
  const options: { id: string | null; name: string; hint: string }[] = [
    ...forms.map((f) => ({ id: f.id, name: f.name, hint: `${f.fields} field${f.fields === 1 ? "" : "s"}` })),
    { id: null, name: "None", hint: "Enquire-only products show no button, and quoted zones can't take requests." },
  ];
  const save = () =>
    start(async () => {
      const r: SettingsFormState = await saveEnquiryFormAction(picked).catch(() => ({ error: "Couldn't reach the server. Try again." }));
      setState(r);
      if (r.ok) setSaved(picked);
    });

  return (
    <div className="space-y-5">
      <p className="text-[14px] leading-[1.55] text-body">
        Enquire-only and sold products show this form with the product named. Delivery zones you quote individually send their requests through it too. Everything sent lands in your Inbox.
      </p>
      {forms.length === 0 && <p className="rounded-card border border-line bg-surface px-4 py-3 text-[13.5px] text-muted">You have no forms yet. Make one under Content · Forms, then choose it here.</p>}
      <div role="radiogroup" aria-label="Enquiry form" className="space-y-2">
        {options.map((o) => {
          const on = picked === o.id;
          return (
            <button
              key={o.id ?? "none"}
              type="button"
              role="radio"
              aria-checked={on}
              disabled={!canEdit}
              onClick={() => setPicked(o.id)}
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
      {canEdit ? (
        <>
          <Notice {...state} />
          <Button type="button" className="w-full" disabled={pending || picked === saved} onClick={save}>
            {pending ? "Saving…" : "Save"}
          </Button>
        </>
      ) : (
        <p className="text-[13px] text-muted">Only an owner can change this.</p>
      )}
    </div>
  );
}
