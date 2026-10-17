"use client";

import { useActionState, useState } from "react";
import { createPageAction, type FormState } from "@/modules/pages/actions";
import { slugFromTitle } from "@/modules/pages/slug";
import { Button, Field, Input, Notice } from "../../ui";
import { keepValues } from "../../../keep-values";

export function NewPageForm({ suggestHome }: { suggestHome: boolean }) {
  const [state, act, pending] = useActionState(createPageAction, {} as FormState);
  const [title, setTitle] = useState(suggestHome ? "Home" : "");
  const [slug, setSlug] = useState(suggestHome ? "home" : "");
  const [slugTouched, setSlugTouched] = useState(suggestHome);

  return (
    <form onSubmit={keepValues(act)} className="space-y-4">
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
      <Field label="Address" htmlFor="new-slug" hint="The end of the link, like about-us. Use home for the front page.">
        <Input
          id="new-slug"
          name="slug"
          value={slug}
          maxLength={80}
          className="font-mono"
          onChange={(e) => {
            setSlugTouched(true);
            setSlug(e.target.value);
          }}
        />
      </Field>
      <Notice {...state} />
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Creating…" : "Create page"}
      </Button>
    </form>
  );
}
