"use client";

import { useActionState, useState } from "react";
import { createPageAction, type FormState } from "@/modules/pages/actions";
import { slugFromTitle } from "@/modules/pages/slug";
import { Button, Field, Input, Notice } from "../../ui";

export function NewPageForm({ suggestHome }: { suggestHome: boolean }) {
  const [state, act, pending] = useActionState(createPageAction, {} as FormState);
  const [title, setTitle] = useState(suggestHome ? "Home" : "");
  const [slug, setSlug] = useState(suggestHome ? "home" : "");
  const [slugTouched, setSlugTouched] = useState(suggestHome);

  return (
    <form action={act} className="space-y-3">
      <Field label="Title" htmlFor="new-title">
        <Input
          id="new-title"
          name="title"
          value={title}
          required
          maxLength={120}
          onChange={(e) => {
            setTitle(e.target.value);
            if (!slugTouched) setSlug(slugFromTitle(e.target.value));
          }}
        />
      </Field>
      <Field label="Address" htmlFor="new-slug">
        <Input
          id="new-slug"
          name="slug"
          value={slug}
          maxLength={80}
          onChange={(e) => {
            setSlugTouched(true);
            setSlug(e.target.value);
          }}
        />
      </Field>
      <p className="text-sm text-[var(--muted)]">
        The address is the end of the link, like <span className="text-[var(--fg)]">about-us</span>. Use{" "}
        <span className="text-[var(--fg)]">home</span> for the front page.
      </p>
      <Notice {...state} />
      <Button type="submit" disabled={pending}>
        {pending ? "Creating…" : "Create page"}
      </Button>
    </form>
  );
}
