"use client";

import { useActionState, useState } from "react";
import {
  freshCodesAction,
  saveNameAction,
  signOutOthersAction,
  signOutSessionAction,
  turnOffTwoFactorAction,
  type AccountState,
} from "@/modules/auth/account-actions";
import type { SignedIn } from "@/modules/auth/sessions";
import { timeAgo } from "@/lib/time";
import { Button, Card, Field, Input, Notice, Pill, Sheet } from "../../ui";
import { RecoveryCodes } from "../../recovery-codes";
import { keepValues } from "../../../keep-values";

export function NameForm({ name }: { name: string }) {
  const [value, setValue] = useState(name);
  const [saved, setSaved] = useState(name);
  const [state, act, pending] = useActionState(async (prev: AccountState, form: FormData) => {
    const r = await saveNameAction(prev, form);
    if (r.ok) setSaved(String(form.get("name") ?? "").trim());
    return r;
  }, {} as AccountState);
  return (
    <form onSubmit={keepValues(act)} className="space-y-3">
      <Field label="Name" htmlFor="acc-name" hint="What the team sees: on Team, and in Activity.">
        <Input id="acc-name" name="name" value={value} maxLength={80} required onChange={(e) => setValue(e.target.value)} />
      </Field>
      <div className="flex items-center gap-3">
        <Button type="submit" size="sm" disabled={pending || value.trim() === saved}>
          {pending ? "Saving…" : "Save"}
        </Button>
        <Notice {...state} />
      </div>
    </form>
  );
}

/** A code from the app, asked for before turning it off or making new recovery codes. */
function CodeSheet({ title, intro, submit, danger, action, onClose }: { title: string; intro: string; submit: string; danger?: boolean; action: (prev: AccountState, form: FormData) => Promise<AccountState>; onClose: () => void }) {
  const [state, act, pending] = useActionState(action, {} as AccountState);
  return (
    <Sheet title={title} onClose={onClose}>
      {state.codes ? (
        <div className="space-y-5">
          <RecoveryCodes codes={state.codes} />
          <Button type="button" className="w-full" onClick={onClose}>
            I&apos;ve saved them
          </Button>
        </div>
      ) : state.ok ? (
        <div className="space-y-5">
          <Notice ok={state.ok} />
          <Button type="button" className="w-full" onClick={onClose}>
            Done
          </Button>
        </div>
      ) : (
        <form onSubmit={keepValues(act)} className="space-y-4">
          <p className="text-[14px] leading-relaxed text-body">{intro}</p>
          <Field label="Code from your app" htmlFor="sheet-code">
            <Input id="sheet-code" name="code" type="text" inputMode="numeric" autoComplete="one-time-code" required autoFocus className="font-mono tracking-[3px]" />
          </Field>
          <Notice error={state.error} fields={state.fields} />
          <Button type="submit" variant={danger ? "danger" : "primary"} disabled={pending} className="w-full">
            {pending ? "Checking…" : submit}
          </Button>
        </form>
      )}
    </Sheet>
  );
}

export function TwoFactorCard({ on, required, recoveryLeft, available }: { on: boolean; required: boolean; recoveryLeft: number; available: boolean }) {
  const [sheet, setSheet] = useState<"codes" | "off" | null>(null);
  return (
    <Card variant="static" className="mt-2.5 px-4 py-3.5" data-testid="two-factor-card">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-medium">A code from an app on your phone</p>
          <p className="mt-0.5 text-[13px] leading-relaxed text-muted">
            On top of the emailed code: six digits from an authenticator app.{" "}
            {required ? "Owners keep it on — this login can move money." : "Worth it if this login matters to you."}
          </p>
          {on && (
            <p className="mt-1.5 text-[13px] text-muted" data-testid="recovery-left">
              {recoveryLeft} recovery code{recoveryLeft === 1 ? "" : "s"} left
            </p>
          )}
        </div>
        <Pill tone={on ? "success" : required ? "warning" : "neutral"}>{on ? "On" : "Off"}</Pill>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {!on && available && (
          <a href="/two-factor?next=/account" className="inline-flex h-9 items-center rounded-button bg-accent px-3.5 text-[13.5px] font-medium text-text hover:bg-accent-hover">
            Set it up
          </a>
        )}
        {!on && !available && <p className="text-[13px] text-muted">Not available on this server yet.</p>}
        {on && (
          <Button type="button" variant="secondary" size="sm" onClick={() => setSheet("codes")}>
            New recovery codes
          </Button>
        )}
        {on && !required && (
          <Button type="button" variant="danger" size="sm" onClick={() => setSheet("off")}>
            Turn it off
          </Button>
        )}
      </div>
      {sheet === "codes" && (
        <CodeSheet
          title="New recovery codes"
          intro="Ten new codes replace the ones you have now, which stop working. Type the code your app shows to make them."
          submit="Make new codes"
          action={freshCodesAction}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet === "off" && (
        <CodeSheet
          title="Turn off the app code?"
          intro="Signing in goes back to just the emailed code. Type the code your app shows to turn it off."
          submit="Turn it off"
          danger
          action={turnOffTwoFactorAction}
          onClose={() => setSheet(null)}
        />
      )}
    </Card>
  );
}

export function SessionRow({ session }: { session: SignedIn }) {
  return (
    <div data-testid="session" className="flex items-center gap-3 px-4 py-3.5">
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-medium">{session.device}</p>
        <p className="mt-0.5 text-[13px] text-muted">{session.current ? "This device, right now" : `Last used ${timeAgo(new Date(session.lastUsed))}`}</p>
      </div>
      {!session.current && (
        <form action={signOutSessionAction}>
          <input type="hidden" name="sessionId" value={session.id} />
          <Button type="submit" variant="quiet" size="sm" aria-label={`Sign out ${session.device}`}>
            Sign out
          </Button>
        </form>
      )}
    </div>
  );
}

export function SignOutOthers() {
  const [state, act, pending] = useActionState(signOutOthersAction, {} as AccountState);
  return (
    <form onSubmit={keepValues(act)} className="space-y-2">
      <Button type="submit" variant="danger" disabled={pending}>
        {pending ? "Signing out…" : "Sign out everywhere else"}
      </Button>
      <p className="text-[12.5px] text-muted">Signs out any other phone or computer, and keeps you signed in here.</p>
      <Notice ok={state.ok} />
    </form>
  );
}
