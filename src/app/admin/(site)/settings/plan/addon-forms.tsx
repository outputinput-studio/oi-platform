"use client";

import { useActionState } from "react";
import { addAddonAction, askAboutAddonAction, removeAddonAction, type AddonFormState } from "@/modules/addons/actions";
import { Button, Notice, Textarea } from "../../../ui";
import { keepValues } from "../../../../keep-values";

/** One add-on's button: Add, Take off, or Ask us — whichever applies. */
export function AddonButton({ addonId, name, has, selfServe }: { addonId: string; name: string; has: boolean; selfServe: boolean }) {
  const action = has ? removeAddonAction : selfServe ? addAddonAction : askAboutAddonAction;
  const [state, act, pending] = useActionState(action, {} as AddonFormState);
  const label = has ? "Take off" : selfServe ? "Add" : "Ask us";
  return (
    <form onSubmit={keepValues(act)} className="flex shrink-0 flex-col items-end gap-1">
      <input type="hidden" name="addonId" value={addonId} />
      <Button type="submit" size="sm" variant={has ? "danger" : selfServe ? "primary" : "secondary"} disabled={pending} aria-label={`${label}: ${name}`}>
        {pending ? "One moment…" : label}
      </Button>
      <Notice ok={state.ok} error={state.error} />
    </form>
  );
}

/** "Something else in mind? Tell us and we will price it." */
export function TellUs() {
  const [state, act, pending] = useActionState(askAboutAddonAction, {} as AddonFormState);
  return (
    <form onSubmit={keepValues(act)} className="space-y-2">
      <label htmlFor="addon-note" className="block text-[13.5px] text-body">
        Something else in mind? Tell us and we&apos;ll price it.
      </label>
      <Textarea id="addon-note" name="note" rows={2} maxLength={1000} placeholder="A booking calendar for fittings…" />
      <div className="flex items-center gap-3">
        <Button type="submit" size="sm" variant="secondary" disabled={pending}>
          {pending ? "Sending…" : "Send"}
        </Button>
        <Notice ok={state.ok} error={state.error} />
      </div>
    </form>
  );
}
