"use client";

import { useActionState } from "react";
import { renameSiteAction, type SettingsFormState } from "@/modules/sites/actions";
import { Button, Field, Input, Notice } from "../../ui";

export function SettingsForm({ name, slug, canEdit }: { name: string; slug: string; canEdit: boolean }) {
  const [state, act, pending] = useActionState(renameSiteAction, {} as SettingsFormState);
  return (
    <form action={act} className="space-y-4">
      <Field label="Site name" htmlFor="site-name">
        <Input id="site-name" name="name" defaultValue={name} maxLength={80} required readOnly={!canEdit} />
      </Field>
      <p className="text-sm text-[var(--muted)]">
        Address: <span className="text-[var(--fg)]">{slug}</span>. Domains arrive in a later stage.
      </p>
      {canEdit ? (
        <>
          <Notice {...state} />
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </Button>
        </>
      ) : (
        <p className="text-sm text-[var(--muted)]">Only an owner can change these.</p>
      )}
    </form>
  );
}
