"use client";

import { useActionState, useState } from "react";
import { createArticleAction, type FormState } from "@/modules/articles/actions";
import { Button, Field, Input, Notice, Sheet } from "../../ui";

/** "Add article" asks for the title; the address comes from it and can be changed in the editor. */
export function AddArticle() {
  const [open, setOpen] = useState(false);
  const [state, act, pending] = useActionState(createArticleAction, {} as FormState);
  return (
    <>
      <Button type="button" size="sm" onClick={() => setOpen(true)}>
        Add article
      </Button>
      {open && (
        <Sheet title="Add an article" onClose={() => setOpen(false)}>
          <form action={act} className="space-y-4">
            <Field label="Title" htmlFor="new-article-title" hint="You can change it, and the address, in the editor.">
              <Input id="new-article-title" name="title" required maxLength={160} autoFocus />
            </Field>
            <Notice {...state} />
            <Button type="submit" disabled={pending} className="w-full">
              {pending ? "Adding…" : "Create article"}
            </Button>
          </form>
        </Sheet>
      )}
    </>
  );
}
