"use server";

import { revalidatePath } from "next/cache";
import { requireSiteAccess } from "@/modules/auth/access";
import { formError } from "@/lib/form-error";
import { connectDomain, disconnectDomain, setDomainWww } from "./domain";
import { launchSite } from "./launch";
import { checkSendingDomain, removeSendingDomain, setUpSendingDomain } from "./sending-domain";

/** Settings · Domain and the sending-domain part of Settings · Sending, as thin actions. */

export type DomainFormState = { ok?: string; error?: string; fields?: string[] };

async function done(path: string, ok = "Saved"): Promise<DomainFormState> {
  revalidatePath(path);
  return { ok };
}

export async function connectDomainAction(_prev: DomainFormState, form: FormData): Promise<DomainFormState> {
  const { user, site } = await requireSiteAccess();
  try {
    await connectDomain({ actorId: user.id, siteId: site.id, domain: String(form.get("domain") ?? "") });
  } catch (err) {
    return formError(err, { fallback: "Couldn't connect that. Try again." });
  }
  return done("/settings/domain", "Connected");
}

/** "Check now": the page checks again as it loads. */
export async function checkDomainAction(): Promise<void> {
  await requireSiteAccess();
  revalidatePath("/settings/domain");
}

export async function setDomainWwwAction(www: boolean): Promise<DomainFormState> {
  const { user, site } = await requireSiteAccess();
  try {
    await setDomainWww({ actorId: user.id, siteId: site.id, www });
  } catch (err) {
    return formError(err, { fallback: "Couldn't change that. Try again." });
  }
  return done("/settings/domain");
}

export async function disconnectDomainAction(): Promise<DomainFormState> {
  const { user, site } = await requireSiteAccess();
  try {
    await disconnectDomain({ actorId: user.id, siteId: site.id });
  } catch (err) {
    return formError(err, { fallback: "Couldn't disconnect it. Try again." });
  }
  return done("/settings/domain", "Disconnected");
}

export async function launchSiteAction(): Promise<DomainFormState> {
  const { user, site } = await requireSiteAccess();
  try {
    await launchSite({ actorId: user.id, siteId: site.id });
  } catch (err) {
    return formError(err, { fallback: "Couldn't launch it. Try again." });
  }
  revalidatePath("/", "layout");
  return { ok: "Live" };
}

export async function setUpSendingDomainAction(_prev: DomainFormState, form: FormData): Promise<DomainFormState> {
  const { user, site } = await requireSiteAccess();
  try {
    await setUpSendingDomain({ actorId: user.id, siteId: site.id, domain: String(form.get("domain") ?? ""), local: String(form.get("local") ?? "") });
  } catch (err) {
    return formError(err, { fallback: "Couldn't set that up. Try again." });
  }
  return done("/settings/sending", "Set up");
}

export async function checkSendingDomainAction(): Promise<DomainFormState> {
  const { user, site } = await requireSiteAccess();
  try {
    await checkSendingDomain({ actorId: user.id, siteId: site.id });
  } catch (err) {
    return formError(err, { fallback: "Couldn't check just now. Try again in a minute." });
  }
  return done("/settings/sending", "Checked");
}

export async function removeSendingDomainAction(): Promise<DomainFormState> {
  const { user, site } = await requireSiteAccess();
  try {
    await removeSendingDomain({ actorId: user.id, siteId: site.id });
  } catch (err) {
    return formError(err, { fallback: "Couldn't remove it. Try again." });
  }
  return done("/settings/sending", "Removed");
}
