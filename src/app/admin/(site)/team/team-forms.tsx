"use client";

import { useActionState, useState } from "react";
import type { Member } from "@/modules/team/server";
import { addMemberAction, removeMemberAction, setRoleAction, type TeamFormState } from "@/modules/team/actions";
import { Button, Field, Input, Notice, Pill, Sheet } from "../../ui";
import { Avatar } from "../nav";

/** "Add someone" in the header opens a sheet with the email field. */
export function AddMember() {
  const [open, setOpen] = useState(false);
  const [state, act, pending] = useActionState(async (prev: TeamFormState, form: FormData) => {
    const r = await addMemberAction(prev, form);
    if (r.ok) setOpen(false);
    return r;
  }, {} as TeamFormState);
  return (
    <>
      <Button type="button" size="sm" onClick={() => setOpen(true)}>
        Add someone
      </Button>
      {open && (
        <Sheet title="Add someone" onClose={() => setOpen(false)}>
          <form action={act} className="space-y-4">
            <Field label="Email" htmlFor="add-email" hint="They sign in with a code sent to this address. They start as staff; make them an owner afterwards if they should be.">
              <Input id="add-email" name="email" type="email" inputMode="email" autoComplete="off" required autoFocus />
            </Field>
            <Notice {...state} />
            <Button type="submit" disabled={pending} className="w-full">
              {pending ? "Adding…" : "Add to team"}
            </Button>
          </form>
        </Sheet>
      )}
    </>
  );
}

export function MemberRow({
  member,
  isYou,
  canManage,
  isLastOwner,
}: {
  member: Member;
  isYou: boolean;
  canManage: boolean;
  isLastOwner: boolean;
}) {
  const [roleState, setRole, rolePending] = useActionState(setRoleAction, {} as TeamFormState);
  const [removeState, remove, removePending] = useActionState(removeMemberAction, {} as TeamFormState);
  const nextRole = member.role === "owner" ? "staff" : "owner";

  return (
    <div data-testid={`member-${member.email}`} className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <Avatar name={member.name || member.email} />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 truncate text-[15px] font-medium">
            {member.name || member.email}
            {isYou && <span className="text-[12px] font-normal text-muted">You</span>}
          </p>
          <p className="truncate text-[13px] text-muted">
            {member.email} · <span data-testid="member-role">{member.role}</span>
          </p>
          <Notice error={roleState.error ?? removeState.error} />
        </div>
        <Pill tone={member.role === "owner" ? "success" : "neutral"}>{member.role === "owner" ? "Owner" : "Staff"}</Pill>
      </div>
      {canManage && (
        <div className="flex shrink-0 gap-2 pl-12 sm:pl-0">
          <form action={setRole}>
            <input type="hidden" name="userId" value={member.userId} />
            <input type="hidden" name="role" value={nextRole} />
            <Button type="submit" variant="quiet" size="sm" disabled={rolePending || isLastOwner} title={isLastOwner ? "The last owner can't step down" : undefined}>
              {nextRole === "owner" ? "Make owner" : "Make staff"}
            </Button>
          </form>
          {!isLastOwner && (
            <form action={remove}>
              <input type="hidden" name="userId" value={member.userId} />
              <Button type="submit" variant="danger" size="sm" disabled={removePending}>
                Remove
              </Button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
