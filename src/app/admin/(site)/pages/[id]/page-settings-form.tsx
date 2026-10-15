"use client";

import { useActionState, useState } from "react";
import { updatePageAction, type FormState } from "@/modules/pages/actions";
import { Field, Input, SaveBar } from "../../../ui";

/** The page's address. Saves on demand from the floating bar; Save is live only while it differs from what's saved. */
export function PageSettingsForm({ pageId, slug, isHome }: { pageId: string; slug: string; isHome: boolean }) {
  const [saved, setSaved] = useState(slug);
  const [value, setValue] = useState(slug);
  const [state, act, pending] = useActionState(async (prev: FormState, form: FormData) => {
    const r = await updatePageAction(prev, form);
    if (r.ok) setSaved(String(form.get("slug")));
    return r;
  }, {} as FormState);

  return (
    <form action={act}>
      <input type="hidden" name="pageId" value={pageId} />
      <Field
        label="Address"
        htmlFor="page-slug"
        hint={isHome ? "The front page's address stays as it is." : "The end of the link. Changing it breaks any link people already have."}
      >
        <Input id="page-slug" name="slug" value={value} maxLength={80} readOnly={isHome} className="font-mono" onChange={(e) => setValue(e.target.value)} />
      </Field>
      {!isHome && <SaveBar dirty={value !== saved} pending={pending} state={state} />}
    </form>
  );
}
