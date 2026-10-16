"use client";

import { useActionState, useState } from "react";
import { addRedirectAction, type FormState } from "@/modules/redirects/actions";
import { saveSearchSettingsAction } from "@/modules/sites/actions";
import type { SearchSettings } from "@/modules/sites/search";
import { Button, Field, Input, Notice, Sheet, Switch } from "../../../ui";

/** "Add a rule" (or "Redirect this", with the address filled in) opens a sheet: from → to. */
export function AddRule({ from = "", label = "Add a rule" }: { from?: string; label?: string }) {
  const [open, setOpen] = useState(false);
  const [state, act, pending] = useActionState(async (prev: FormState, form: FormData) => {
    const r = await addRedirectAction(prev, form);
    if (r.ok) setOpen(false);
    return r;
  }, {} as FormState);
  return (
    <>
      <Button type="button" size="sm" variant={from ? "secondary" : "primary"} onClick={() => setOpen(true)}>
        {label}
      </Button>
      {open && (
        <Sheet title={from ? "Redirect this address" : "Add a rule"} onClose={() => setOpen(false)}>
          <form action={act} className="space-y-4">
            <Field label="From" htmlFor="r-from" hint="The old address, as people have it: /old-page or /shop/thing.html">
              <Input id="r-from" name="from" defaultValue={from} required maxLength={300} className="font-mono" autoFocus={!from} />
            </Field>
            <Field label="To" htmlFor="r-to" hint="A page on your site, like /about, or a full address starting with https://">
              <Input id="r-to" name="to" required maxLength={600} className="font-mono" placeholder="/" autoFocus={!!from} />
            </Field>
            <Notice {...state} />
            <Button type="submit" disabled={pending} className="w-full">
              {pending ? "Saving…" : "Save rule"}
            </Button>
          </form>
        </Sheet>
      )}
    </>
  );
}

/** "Redirect automatically when I rename a page" — lives with the search settings. */
export function AutoRedirectSwitch({ initial, settings, canEdit }: { initial: boolean; settings: SearchSettings; canEdit: boolean }) {
  const [on, setOn] = useState(initial);
  const [error, setError] = useState("");
  return (
    <>
      <Switch
        checked={on}
        disabled={!canEdit}
        onChange={async (v) => {
          setOn(v);
          const r = await saveSearchSettingsAction({ ...settings, autoRedirect: v }).catch(() => ({ error: "couldn't reach the server" }));
          if (r.error) {
            setOn(!v);
            setError(r.error);
          } else setError("");
        }}
        label="Redirect automatically when I rename a page"
        hint="Keeps old links working without you thinking about it. You can remove the rule later."
      />
      <Notice error={error} />
    </>
  );
}
