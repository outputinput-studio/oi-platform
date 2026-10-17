"use client";

import { useActionState } from "react";
import { joinAction, newLinkAction, type JoinState } from "@/modules/team/join-actions";
import { Button, Notice } from "../../ui";
import { keepValues } from "../../../keep-values";

export function JoinForm({ token, siteName }: { token: string; siteName: string }) {
  const [state, act, pending] = useActionState(joinAction, {} as JoinState);
  return (
    <form onSubmit={keepValues(act)} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <Notice error={state.error} />
      <Button type="submit" disabled={pending} className="h-12 w-full text-[16px]">
        {pending ? "One moment…" : `Join ${siteName}`}
      </Button>
      <p className="text-center text-[12.5px] leading-relaxed text-faint">Next, we email you a six-digit code to sign in. There&apos;s no password.</p>
    </form>
  );
}

export function NewLinkForm({ token }: { token: string }) {
  const [state, act, pending] = useActionState(newLinkAction, {} as JoinState);
  return (
    <form onSubmit={keepValues(act)} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      {state.ok ? (
        <Notice ok={state.ok} />
      ) : (
        <Button type="submit" disabled={pending} className="h-12 w-full text-[16px]">
          {pending ? "One moment…" : "Send me a new link"}
        </Button>
      )}
    </form>
  );
}
