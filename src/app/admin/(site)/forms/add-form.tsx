"use client";

import { useActionState, useState } from "react";
import { createFormAction, type FormState } from "@/modules/forms/actions";
import { Button, Field, Input, Notice, Sheet } from "../../ui";

/** "Add form" opens a sheet asking only for a name; the form starts with name, email and message. */
export function AddForm() {
  const [open, setOpen] = useState(false);
  const [state, act, pending] = useActionState(createFormAction, {} as FormState);
  return (
    <>
      <Button type="button" size="sm" onClick={() => setOpen(true)}>
        Add form
      </Button>
      {open && (
        <Sheet title="Add a form" onClose={() => setOpen(false)}>
          <form action={act} className="space-y-4">
            <Field label="Form name" htmlFor="new-form-name" hint="Only you see this: Contact, Enquiry, Newsletter.">
              <Input id="new-form-name" name="name" required maxLength={80} autoFocus />
            </Field>
            <Notice {...state} />
            <Button type="submit" disabled={pending} className="w-full">
              {pending ? "Adding…" : "Create form"}
            </Button>
          </form>
        </Sheet>
      )}
    </>
  );
}
