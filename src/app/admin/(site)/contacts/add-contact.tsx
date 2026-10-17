"use client";

import { useActionState, useState } from "react";
import { createContactAction, type FormState } from "@/modules/contacts/actions";
import { Button, Field, Input, Notice, Sheet } from "../../ui";
import { keepValues } from "../../../keep-values";

/** "Add someone" opens a sheet: name, email, phone — any one will do. */
export function AddContact() {
  const [open, setOpen] = useState(false);
  const [state, act, pending] = useActionState(createContactAction, {} as FormState);
  return (
    <>
      <Button type="button" size="sm" onClick={() => setOpen(true)}>
        Add someone
      </Button>
      {open && (
        <Sheet title="Add someone" onClose={() => setOpen(false)}>
          <form onSubmit={keepValues(act)} className="space-y-4">
            <Field label="Name" htmlFor="new-contact-name">
              <Input id="new-contact-name" name="name" maxLength={120} autoFocus />
            </Field>
            <Field label="Email" htmlFor="new-contact-email">
              <Input id="new-contact-email" name="email" type="email" inputMode="email" maxLength={200} autoComplete="off" />
            </Field>
            <Field label="Phone" htmlFor="new-contact-phone">
              <Input id="new-contact-phone" name="phone" type="tel" inputMode="tel" maxLength={40} autoComplete="off" />
            </Field>
            <Notice {...state} />
            <Button type="submit" disabled={pending} className="w-full">
              {pending ? "Adding…" : "Add contact"}
            </Button>
          </form>
        </Sheet>
      )}
    </>
  );
}
