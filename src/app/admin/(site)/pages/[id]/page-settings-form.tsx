"use client";

import { useActionState, useState } from "react";
import { updatePageAction, type FormState } from "@/modules/pages/actions";
import { Field, Input, SaveBar } from "../../../ui";

/** Title and address. Saves on demand from the floating bar; Save is live only while something differs from what's saved. */
export function PageSettingsForm({ pageId, title, slug, isHome }: { pageId: string; title: string; slug: string; isHome: boolean }) {
  const [saved, setSaved] = useState({ title, slug });
  const [values, setValues] = useState(saved);
  const [state, act, pending] = useActionState(async (prev: FormState, form: FormData) => {
    const r = await updatePageAction(prev, form);
    if (r.ok) setSaved({ title: String(form.get("title")), slug: String(form.get("slug")) });
    return r;
  }, {} as FormState);
  const dirty = values.title !== saved.title || values.slug !== saved.slug;

  return (
    <form action={act} className="space-y-3">
      <input type="hidden" name="pageId" value={pageId} />
      <Field label="Title" htmlFor="page-title">
        <Input id="page-title" name="title" value={values.title} required maxLength={120} onChange={(e) => setValues({ ...values, title: e.target.value })} />
      </Field>
      <Field label="Address" htmlFor="page-slug">
        <Input id="page-slug" name="slug" value={values.slug} maxLength={80} readOnly={isHome} onChange={(e) => setValues({ ...values, slug: e.target.value })} />
      </Field>
      {isHome && <p className="text-sm text-[var(--muted)]">The front page&apos;s address stays as it is.</p>}
      <SaveBar dirty={dirty} pending={pending} state={state} />
    </form>
  );
}
