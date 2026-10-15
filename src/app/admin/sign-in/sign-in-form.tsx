"use client";

import { useActionState } from "react";
import { sendCode, verifyCode, type SignInState } from "@/modules/auth/actions";

/**
 * Two steps on one screen: email, then the six-digit code. State lives in
 * the server action's return value, so a refresh never loses the step and
 * there is nothing to hydrate but the form itself.
 */
export function SignInForm() {
  const [state, act, pending] = useActionState(
    (prev: SignInState, form: FormData) => (prev.step === "code" ? verifyCode(prev, form) : sendCode(prev, form)),
    { step: "email" } as SignInState,
  );

  if (state.step === "code") {
    return (
      <form action={act} className="space-y-4">
        <input type="hidden" name="email" value={state.email} />
        <p className="text-sm text-[var(--muted)]">
          If <span className="text-[var(--fg)]">{state.email}</span> belongs to a site, a code is on its way. Didn&apos;t get
          one? Check the address, or ask the site owner to add you.
        </p>
        {state.devCode && (
          <p className="rounded-md border border-dashed border-[var(--border)] p-3 text-sm">
            <span className="text-[var(--muted)]">Not production, no email provider — your code is </span>
            <code data-testid="dev-code" className="font-mono text-base tracking-widest">
              {state.devCode}
            </code>
          </p>
        )}
        <Field label="Code" name="code" type="text" inputMode="numeric" pattern="[0-9]{6}" autoComplete="one-time-code" />
        {state.error && <Error text={state.error} />}
        <Button pending={pending} label="Sign in" />
        <p className="text-sm">
          <a href="/sign-in" className="text-[var(--muted)] underline-offset-4 hover:underline">
            Use a different email
          </a>
        </p>
      </form>
    );
  }

  return (
    <form action={act} className="space-y-4">
      <p className="text-sm text-[var(--muted)]">We&apos;ll email you a six-digit code. No password.</p>
      <Field label="Email" name="email" type="email" inputMode="email" autoComplete="email" />
      {state.error && <Error text={state.error} />}
      <Button pending={pending} label="Send code" />
    </form>
  );
}

function Field(props: {
  label: string;
  name: string;
  type: string;
  inputMode?: "email" | "numeric";
  pattern?: string;
  autoComplete?: string;
}) {
  const id = `field-${props.name}`;
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm text-[var(--muted)]">
        {props.label}
      </label>
      <input
        id={id}
        name={props.name}
        type={props.type}
        inputMode={props.inputMode}
        pattern={props.pattern}
        autoComplete={props.autoComplete}
        required
        autoFocus
        className="block w-full rounded-md border border-[var(--border)] bg-transparent px-3 py-3 text-base outline-none focus:border-[var(--accent)]"
      />
    </div>
  );
}

function Error({ text }: { text: string }) {
  return (
    <p role="alert" className="text-sm text-[var(--fg)]">
      {text}
    </p>
  );
}

function Button({ pending, label }: { pending: boolean; label: string }) {
  return (
    <button
      type="submit"
      disabled={pending}
      className="block w-full rounded-md bg-[var(--accent)] px-4 py-3 text-base font-medium text-[var(--fg)] disabled:opacity-60"
    >
      {pending ? "One moment…" : label}
    </button>
  );
}
