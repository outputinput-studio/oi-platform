"use client";

import { useActionState } from "react";
import type { Member } from "@/modules/team/server";
import { addMemberAction, removeMemberAction, setRoleAction, type TeamFormState } from "@/modules/team/actions";
import { Button, Field, Input, Notice } from "../../ui";

export function AddMemberForm() {
  const [state, act, pending] = useActionState(addMemberAction, {} as TeamFormState);
  return (
    <form action={act} className="space-y-3">
      <Field label="Email" htmlFor="add-email">
        <Input id="add-email" name="email" type="email" inputMode="email" autoComplete="off" required />
      </Field>
      <p className="text-sm text-[var(--muted)]">They&apos;ll sign in with a code sent to this address. No invitation email yet.</p>
      <Notice {...state} />
      <Button type="submit" disabled={pending}>
        {pending ? "Adding…" : "Add to team"}
      </Button>
    </form>
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
    <li data-testid={`member-${member.email}`} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="truncate text-base">
          {member.name}
          {isYou && <span className="ml-2 text-xs text-[var(--muted)]">You</span>}
        </p>
        <p className="truncate text-sm text-[var(--muted)]">
          {member.email} · <span data-testid="member-role">{member.role}</span>
        </p>
        <Notice error={roleState.error ?? removeState.error} />
      </div>
      {canManage && (
        <div className="flex shrink-0 gap-2">
          <form action={setRole}>
            <input type="hidden" name="userId" value={member.userId} />
            <input type="hidden" name="role" value={nextRole} />
            <Button type="submit" variant="quiet" disabled={rolePending || isLastOwner} title={isLastOwner ? "The last owner can't step down" : undefined}>
              {nextRole === "owner" ? "Make owner" : "Make staff"}
            </Button>
          </form>
          {!isLastOwner && (
            <form action={remove}>
              <input type="hidden" name="userId" value={member.userId} />
              <Button type="submit" variant="danger" disabled={removePending}>
                Remove
              </Button>
            </form>
          )}
        </div>
      )}
    </li>
  );
}
