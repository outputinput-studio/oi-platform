"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSiteAccess } from "@/modules/auth/access";
import { MEMBERSHIP_ROLES } from "@/db/schema";
import { addMember, removeMember, setRole } from "./server";

/**
 * Form handlers for the team page. Thin: read the form, call the module,
 * turn errors into a message. Authorisation happens inside the module.
 */
export type TeamFormState = { ok?: string; error?: string };

function message(err: unknown): string {
  if (err instanceof z.ZodError) return err.issues[0]?.message ?? "That doesn't look right.";
  if (err instanceof Error) return err.message;
  return "Something went wrong. Try again.";
}

export async function addMemberAction(_prev: TeamFormState, form: FormData): Promise<TeamFormState> {
  const { user, site } = await requireSiteAccess();
  try {
    const email = z.string().trim().toLowerCase().email("That doesn't look like an email address.").parse(form.get("email"));
    const r = await addMember({ actorId: user.id, siteId: site.id, email });
    revalidatePath("/team");
    if (!r.added) return { ok: `${r.email} is already on the team.` };
    return { ok: r.accountCreated ? `${r.email} added. They can sign in with that address now.` : `${r.email} added.` };
  } catch (err) {
    return { error: message(err) };
  }
}

export async function setRoleAction(_prev: TeamFormState, form: FormData): Promise<TeamFormState> {
  const { user, site } = await requireSiteAccess();
  try {
    const userId = z.string().min(1).parse(form.get("userId"));
    const role = z.enum(MEMBERSHIP_ROLES).parse(form.get("role"));
    await setRole({ actorId: user.id, siteId: site.id, userId, role });
    revalidatePath("/team");
    return {};
  } catch (err) {
    return { error: message(err) };
  }
}

export async function removeMemberAction(_prev: TeamFormState, form: FormData): Promise<TeamFormState> {
  const { user, site } = await requireSiteAccess();
  try {
    const userId = z.string().min(1).parse(form.get("userId"));
    await removeMember({ actorId: user.id, siteId: site.id, userId });
    revalidatePath("/team");
    return {};
  } catch (err) {
    return { error: message(err) };
  }
}
