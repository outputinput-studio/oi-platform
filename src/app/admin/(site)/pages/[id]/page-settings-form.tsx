"use client";

import { useActionState } from "react";
import { updatePageAction, type FormState } from "@/modules/pages/actions";
import { Button, Field, Input, Notice } from "../../../ui";

export function PageSettingsForm({ pageId, title, slug, isHome }: { pageId: string; title: string; slug: string; isHome: boolean }) {
  const [state, act, pending] = useActionState(updatePageAction, {} as FormState);
  return (
    <form action={act} className="space-y-3">
      <input type="hidden" name="pageId" value={pageId} />
      <Field label="Title" htmlFor="page-title">
        <Input id="page-title" name="title" defaultValue={title} required maxLength={120} />
      </Field>
      <Field label="Address" htmlFor="page-slug">
        <Input id="page-slug" name="slug" defaultValue={slug} maxLength={80} readOnly={isHome} />
      </Field>
      {isHome && <p className="text-sm text-[var(--muted)]">The front page&apos;s address stays as it is.</p>}
      <Notice {...state} />
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save"}
      </Button>
    </form>
  );
}
