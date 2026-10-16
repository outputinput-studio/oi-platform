"use client";

import { useActionState, useState } from "react";
import { createMenuAction, type MenuFormState } from "@/modules/menus/actions";
import { Button, Field, Input, Notice, Sheet } from "../../ui";

/** The dashed "Add menu" under the list: a name, then straight into the editor. */
export function AddMenu() {
  const [open, setOpen] = useState(false);
  const [state, act, pending] = useActionState(createMenuAction, {} as MenuFormState);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-2.5 flex h-12 w-full items-center justify-center gap-2 rounded-card border border-dashed border-accent text-[14.5px] text-text hover:bg-hover"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
          <path d="M5 12h14M12 5v14" />
        </svg>
        Add menu
      </button>
      {open && (
        <Sheet title="Add a menu" onClose={() => setOpen(false)}>
          <form action={act} className="space-y-4">
            <Field label="Menu name" htmlFor="new-menu-name" hint="Shows as the heading of its footer column: Help, Shop, Follow along.">
              <Input id="new-menu-name" name="name" required maxLength={60} autoFocus />
            </Field>
            <Notice {...state} />
            <Button type="submit" disabled={pending} className="w-full">
              {pending ? "Adding…" : "Create menu"}
            </Button>
          </form>
        </Sheet>
      )}
    </>
  );
}
