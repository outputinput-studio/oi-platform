"use client";

import { startTransition, type FormEvent } from "react";

/**
 * React 19 clears a form after its action runs — so a form that comes back
 * with a mistake has lost everything typed into it. Submit through this
 * instead (`<form onSubmit={keepValues(act)}>`), and what was typed stays put
 * while the mistake is outlined. Same action, same pending state. Admin, ops
 * and the storefront all use it.
 */
export function keepValues(act: (form: FormData) => void) {
  return (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    // The button that was pressed goes in too, as a plain submit would send it.
    const form = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter);
    startTransition(() => act(form));
  };
}
