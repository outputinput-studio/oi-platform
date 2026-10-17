"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { requireSiteAccess } from "@/modules/auth/access";
import { MEMBERSHIP_ROLES } from "@/db/schema";
import { removeMember, setRole } from "./server";
import { cancelInvite, invite, resendInvite, setInviteRole } from "./invitations";
import { formError } from "@/lib/form-error";
import { resetTwoFactor } from "@/modules/auth/two-factor";

/**
 * Form handlers for the team page. Thin: read the form, call the module,
 * turn errors into a message. Authorisation happens inside the module.
 */
export type TeamFormState = { ok?: string; error?: string; fields?: string[] };

/** The admin host this request came in on, for the link in an invitation. */
async function adminHost(): Promise<string> {
  return (await headers()).get("x-oi-host") ?? "";
}

export async function inviteAction(_prev: TeamFormState, form: FormData): Promise<TeamFormState> {
  const { user, site } = await requireSiteAccess();
  try {
    const role = z.enum(MEMBERSHIP_ROLES).catch("staff").parse(form.get("role") ?? "staff");
    const r = await invite({ actorId: user.id, siteId: site.id, email: String(form.get("email") ?? ""), role, host: await adminHost() });
    revalidatePath("/team");
    return { ok: r.emailed ? `Invitation sent to ${r.email}.` : `Invitation made, but the email didn't go out. Copy the link and send it to ${r.email} yourself.` };
  } catch (err) {
    return formError(err);
  }
}

export async function setInviteRoleAction(_prev: TeamFormState, form: FormData): Promise<TeamFormState> {
  const { user, site } = await requireSiteAccess();
  try {
    const role = z.enum(MEMBERSHIP_ROLES).parse(form.get("role"));
    await setInviteRole({ actorId: user.id, siteId: site.id, inviteId: String(form.get("inviteId") ?? ""), role });
    revalidatePath("/team");
    return {};
  } catch (err) {
    return formError(err);
  }
}

export async function resendInviteAction(_prev: TeamFormState, form: FormData): Promise<TeamFormState> {
  const { user, site } = await requireSiteAccess();
  try {
    const sent = await resendInvite({ actorId: user.id, siteId: site.id, inviteId: String(form.get("inviteId") ?? ""), host: await adminHost() });
    revalidatePath("/team");
    return sent ? { ok: "Sent again. Good for another 14 days." } : { error: "The email didn't go out. Copy the link and send it yourself." };
  } catch (err) {
    return formError(err);
  }
}

export async function cancelInviteAction(_prev: TeamFormState, form: FormData): Promise<TeamFormState> {
  const { user, site } = await requireSiteAccess();
  try {
    await cancelInvite({ actorId: user.id, siteId: site.id, inviteId: String(form.get("inviteId") ?? "") });
    revalidatePath("/team");
    return {};
  } catch (err) {
    return formError(err);
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
    return formError(err);
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
    return formError(err);
  }
}

/** An Owner resets someone's authenticator app (lost phone, no recovery codes). */
export async function resetTwoFactorAction(_prev: TeamFormState, form: FormData): Promise<TeamFormState> {
  const { user, site } = await requireSiteAccess();
  try {
    const userId = z.string().min(1).parse(form.get("userId"));
    await resetTwoFactor({ actorId: user.id, siteId: site.id, userId });
    revalidatePath("/team");
    return { ok: "Reset. They'll set it up again when they next sign in." };
  } catch (err) {
    return formError(err);
  }
}
