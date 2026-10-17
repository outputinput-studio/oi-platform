"use client";

import { useActionState, useState } from "react";
import type { MembershipRole } from "@/db/schema";
import { ROLE_ABOUT, ROLE_NAMES } from "@/modules/auth/roles";
import type { Member } from "@/modules/team/server";
import {
  cancelInviteAction,
  inviteAction,
  removeMemberAction,
  resendInviteAction,
  resetTwoFactorAction,
  setInviteRoleAction,
  setRoleAction,
  type TeamFormState,
} from "@/modules/team/actions";
import type { InviteRow } from "@/modules/team/invitations";
import type { InviteStatus } from "@/modules/team/invite-status";
import { LocalTime } from "../local-time";
import { timeAgo } from "@/lib/time";
import { Button, Field, Input, Notice, Pill, Sheet } from "../../ui";
import { Avatar } from "../nav";
import { keepValues } from "../../../keep-values";

/** The three roles as choices, each with what it can do. */
export function RoleChoice({ current }: { current: MembershipRole }) {
  return (
    <fieldset className="space-y-1.5">
      <legend className="mb-2 text-[13.5px] text-muted">Role</legend>
      {(Object.keys(ROLE_NAMES) as MembershipRole[]).map((r) => (
        <label key={r} className="flex cursor-pointer items-start gap-3 rounded-card border border-line px-4 py-3 hover:bg-hover has-[:checked]:border-accent has-[:checked]:bg-surface">
          <input type="radio" name="role" value={r} defaultChecked={r === current} className="mt-[3px] h-4 w-4 flex-none accent-accent" />
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-medium">{ROLE_NAMES[r]}</span>
            <span className="mt-0.5 block text-[13px] leading-snug text-muted">{ROLE_ABOUT[r]}</span>
          </span>
        </label>
      ))}
    </fieldset>
  );
}

/** "Invite someone" in the header: a sheet with the email and the role. */
export function InviteSomeone() {
  const [open, setOpen] = useState(false);
  const [state, act, pending] = useActionState(async (prev: TeamFormState, form: FormData) => {
    const r = await inviteAction(prev, form);
    if (r.ok) setOpen(false);
    return r;
  }, {} as TeamFormState);
  return (
    <>
      <Button type="button" size="sm" onClick={() => setOpen(true)}>
        Invite someone
      </Button>
      {open && (
        <Sheet title="Invite someone" onClose={() => setOpen(false)}>
          <form onSubmit={keepValues(act)} className="space-y-4">
            <Field label="Email" htmlFor="invite-email" hint="We email them a link to join. It works for 14 days.">
              <Input id="invite-email" name="email" type="email" inputMode="email" autoComplete="off" required autoFocus />
            </Field>
            <RoleChoice current="staff" />
            <Notice {...state} />
            <Button type="submit" disabled={pending} className="w-full">
              {pending ? "Sending…" : "Send invitation"}
            </Button>
          </form>
        </Sheet>
      )}
    </>
  );
}

const INVITE_PILL: Record<InviteStatus, { label: string; tone: "success" | "warning" | "alert" | "neutral" }> = {
  sent: { label: "Sent", tone: "neutral" },
  opened: { label: "Opened", tone: "warning" },
  accepted: { label: "Accepted", tone: "success" },
  expired: { label: "Expired", tone: "alert" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};

/** One invitation under "Waiting to accept", with what to do about it (Owners). */
export function InviteRowView({ inv, canManage }: { inv: InviteRow; canManage: boolean }) {
  const [sheet, setSheet] = useState<"role" | "cancel" | null>(null);
  const [copied, setCopied] = useState(false);
  const close = () => setSheet(null);
  const [roleState, setRole, rolePending] = useActionState(async (prev: TeamFormState, form: FormData) => {
    const r = await setInviteRoleAction(prev, form);
    if (!r.error) close();
    return r;
  }, {} as TeamFormState);
  const [resendState, resend, resendPending] = useActionState(resendInviteAction, {} as TeamFormState);
  const [cancelState, cancel, cancelPending] = useActionState(async (prev: TeamFormState, form: FormData) => {
    const r = await cancelInviteAction(prev, form);
    if (!r.error) close();
    return r;
  }, {} as TeamFormState);
  const pill = INVITE_PILL[inv.status];
  const waiting = inv.status !== "accepted";

  return (
    <div data-testid={`invite-${inv.email}`} className="px-4 py-3.5">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate font-mono text-[14px] text-text">{inv.email}</p>
          <p className="mt-0.5 text-[12.5px] text-muted">
            <span data-testid="invite-role">{ROLE_NAMES[inv.role]}</span>
            {inv.status === "accepted" ? (
              <>
                {" "}· accepted <LocalTime iso={new Date(inv.acceptedAt!).toISOString()} style="date" /> · now in the team above
              </>
            ) : (
              <>
                {" "}· sent <LocalTime iso={new Date(inv.sentAt).toISOString()} style="date" /> · {inv.status === "expired" ? "expired" : "expires"}{" "}
                <LocalTime iso={new Date(inv.expiresAt).toISOString()} style="date" />
              </>
            )}
          </p>
          {inv.status === "opened" && <p className="mt-1 text-[12.5px] text-muted">Opened {timeAgo(new Date(inv.openedAt!))}, not finished.</p>}
          {inv.status === "sent" && (
            <p className="mt-1 text-[12.5px] leading-relaxed text-muted">Not opened yet. If it has been a day, the email may have landed in spam — copy the link and send it yourself.</p>
          )}
          {inv.status === "expired" && <p className="mt-1 text-[12.5px] leading-relaxed text-muted">The link has run out. Resend it, or they can ask for a new one from the link itself.</p>}
          {waiting && (
            <p data-testid="invite-link" className="mt-1.5 truncate font-mono text-[12px] text-faint">
              {inv.link}
            </p>
          )}
          {!sheet && <Notice error={roleState.error ?? resendState.error ?? cancelState.error} ok={resendState.ok} />}
        </div>
        <Pill tone={pill.tone}>{pill.label}</Pill>
      </div>
      {canManage && waiting && (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={async () => {
              await navigator.clipboard.writeText(inv.link);
              setCopied(true);
            }}
          >
            {copied ? "Copied" : "Copy the link"}
          </Button>
          <Button type="button" variant="quiet" size="sm" onClick={() => setSheet("role")}>
            Change role
          </Button>
          <form onSubmit={keepValues(resend)}>
            <input type="hidden" name="inviteId" value={inv.id} />
            <Button type="submit" variant="quiet" size="sm" disabled={resendPending}>
              {resendPending ? "Sending…" : "Resend"}
            </Button>
          </form>
          <Button type="button" variant="danger" size="sm" onClick={() => setSheet("cancel")}>
            Cancel
          </Button>
        </div>
      )}

      {sheet === "role" && (
        <Sheet title="Change role" onClose={close}>
          <form onSubmit={keepValues(setRole)} className="space-y-4">
            <p className="text-[14.5px]">
              What <span className="font-mono">{inv.email}</span> can do once they join.
            </p>
            <input type="hidden" name="inviteId" value={inv.id} />
            <RoleChoice current={inv.role} />
            <Notice {...roleState} />
            <Button type="submit" disabled={rolePending} className="w-full">
              {rolePending ? "Saving…" : "Save"}
            </Button>
          </form>
        </Sheet>
      )}
      {sheet === "cancel" && (
        <Sheet title="Cancel the invitation?" onClose={close}>
          <form onSubmit={keepValues(cancel)} className="space-y-4">
            <p className="text-[14.5px] leading-relaxed">
              The link stops working. <span className="font-mono">{inv.email}</span> can&apos;t join unless you invite them again.
            </p>
            <input type="hidden" name="inviteId" value={inv.id} />
            <Notice error={cancelState.error} />
            <div className="flex gap-2">
              <Button type="submit" variant="danger" disabled={cancelPending} className="flex-1">
                {cancelPending ? "Cancelling…" : "Cancel it"}
              </Button>
              <Button type="button" variant="quiet" onClick={close} className="flex-1">
                Keep it
              </Button>
            </div>
          </form>
        </Sheet>
      )}
    </div>
  );
}

export function MemberRow({
  member,
  isYou,
  canManage,
  isLastOwner,
  siteName,
}: {
  member: Member;
  isYou: boolean;
  canManage: boolean;
  isLastOwner: boolean;
  siteName: string;
}) {
  const [sheet, setSheet] = useState<"role" | "remove" | "reset" | null>(null);
  const close = () => setSheet(null);
  const [roleState, setRole, rolePending] = useActionState(async (prev: TeamFormState, form: FormData) => {
    const r = await setRoleAction(prev, form);
    if (!r.error) close();
    return r;
  }, {} as TeamFormState);
  const [removeState, remove, removePending] = useActionState(async (prev: TeamFormState, form: FormData) => {
    const r = await removeMemberAction(prev, form);
    if (!r.error) close();
    return r;
  }, {} as TeamFormState);
  const [resetState, reset, resetPending] = useActionState(async (prev: TeamFormState, form: FormData) => {
    const r = await resetTwoFactorAction(prev, form);
    if (!r.error) close();
    return r;
  }, {} as TeamFormState);
  const who = member.name || member.email;

  return (
    <div data-testid={`member-${member.email}`} className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <Avatar name={who} />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 truncate text-[15px] font-medium">
            {who}
            {isYou && <span className="text-[12px] font-normal text-muted">You</span>}
          </p>
          <p className="truncate font-mono text-[12.5px] text-muted">{member.email}</p>
          <p className="mt-0.5 text-[12.5px] text-muted">
            {member.lastSignedIn ? `Signed in ${timeAgo(new Date(member.lastSignedIn))}` : "Not signed in yet"}
            {member.twoFactor && <span data-testid="member-two-factor"> · app code on</span>}
          </p>
          {canManage && isLastOwner && <p className="mt-1 text-[12.5px] text-muted">Every site needs an Owner. Make someone else an Owner first.</p>}
          {!sheet && <Notice error={roleState.error ?? removeState.error ?? resetState.error} ok={resetState.ok} />}
        </div>
        <Pill tone={member.role === "owner" ? "success" : "neutral"}>
          <span data-testid="member-role">{ROLE_NAMES[member.role]}</span>
        </Pill>
      </div>
      {canManage && (!isLastOwner || (member.twoFactor && !isYou)) && (
        <div className="flex shrink-0 flex-wrap gap-2 pl-12 sm:pl-0">
          {!isLastOwner && (
            <Button type="button" variant="quiet" size="sm" onClick={() => setSheet("role")}>
              Change role
            </Button>
          )}
          {member.twoFactor && !isYou && (
            <Button type="button" variant="quiet" size="sm" onClick={() => setSheet("reset")}>
              Reset two-factor
            </Button>
          )}
          {!isLastOwner && (
            <Button type="button" variant="danger" size="sm" onClick={() => setSheet("remove")}>
              Remove
            </Button>
          )}
        </div>
      )}

      {sheet === "reset" && (
        <Sheet title="Reset two-factor?" onClose={close}>
          <form onSubmit={keepValues(reset)} className="space-y-4">
            <p className="text-[14.5px] leading-relaxed">
              For when <span className="font-medium">{who}</span> has lost their phone and their recovery codes. They&apos;re signed out everywhere, and set the app
              up again the next time they sign in.
            </p>
            <input type="hidden" name="userId" value={member.userId} />
            <Notice error={resetState.error} />
            <div className="flex gap-2">
              <Button type="submit" variant="danger" disabled={resetPending} className="flex-1">
                {resetPending ? "Resetting…" : "Reset it"}
              </Button>
              <Button type="button" variant="quiet" onClick={close} className="flex-1">
                Keep it
              </Button>
            </div>
          </form>
        </Sheet>
      )}

      {sheet === "role" && (
        <Sheet title="Change role" onClose={close}>
          <form onSubmit={keepValues(setRole)} className="space-y-4">
            <p className="text-[14.5px]">
              What <span className="font-medium">{who}</span> can do on {siteName}.
            </p>
            <input type="hidden" name="userId" value={member.userId} />
            <RoleChoice current={member.role} />
            <Notice {...roleState} />
            <Button type="submit" disabled={rolePending} className="w-full">
              {rolePending ? "Saving…" : "Save"}
            </Button>
          </form>
        </Sheet>
      )}

      {sheet === "remove" && (
        <Sheet title="Take them off the team?" onClose={close}>
          <form onSubmit={keepValues(remove)} className="space-y-4">
            <p className="text-[14.5px] leading-relaxed">
              <span className="font-medium">{who}</span> won&apos;t be able to sign in to {siteName} any more. What they did stays, and Activity still shows it.
            </p>
            <input type="hidden" name="userId" value={member.userId} />
            <Notice error={removeState.error} />
            <div className="flex gap-2">
              <Button type="submit" variant="danger" disabled={removePending} className="flex-1">
                {removePending ? "Removing…" : "Remove them"}
              </Button>
              <Button type="button" variant="quiet" onClick={close} className="flex-1">
                Keep them
              </Button>
            </div>
          </form>
        </Sheet>
      )}
    </div>
  );
}
