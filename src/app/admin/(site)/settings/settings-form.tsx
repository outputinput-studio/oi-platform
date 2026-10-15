"use client";

import { useActionState, useState } from "react";
import { renameSiteAction, type SettingsFormState } from "@/modules/sites/actions";
import { Field, Input, SaveBar } from "../../ui";

export function SettingsForm({ name, slug, canEdit }: { name: string; slug: string; canEdit: boolean }) {
  const [saved, setSaved] = useState(name);
  const [value, setValue] = useState(name);
  const [state, act, pending] = useActionState(async (prev: SettingsFormState, form: FormData) => {
    const r = await renameSiteAction(prev, form);
    if (r.ok) setSaved(String(form.get("name")));
    return r;
  }, {} as SettingsFormState);

  return (
    <form action={act} className="space-y-4">
      <Field label="Site name" htmlFor="site-name" hint={`Shown in the admin and on the site. The address stays ${slug}.`}>
        <Input id="site-name" name="name" value={value} maxLength={80} required readOnly={!canEdit} onChange={(e) => setValue(e.target.value)} />
      </Field>
      {canEdit ? <SaveBar dirty={value !== saved} pending={pending} state={state} /> : <p className="text-[13px] text-muted">Only an owner can change this.</p>}
    </form>
  );
}
