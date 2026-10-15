"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireSiteAccess } from "@/modules/auth/access";
import { siteFromHost } from "@/modules/sites/server";
import { SUBMISSION_STATUSES } from "@/db/schema";
import { createForm, deleteForm, reorderForms, setSubmissionStatus, submitForm, updateForm } from "./server";

export type FormState = { ok?: string; error?: string };

function message(err: unknown): string {
  if (err instanceof z.ZodError) return err.issues[0]?.message ?? "That doesn't look right.";
  if (err instanceof Error) return err.message;
  return "Something went wrong. Try again.";
}

export async function createFormAction(_prev: FormState, form: FormData): Promise<FormState> {
  const { user, site } = await requireSiteAccess();
  let id: string;
  try {
    id = (await createForm({ actorId: user.id, siteId: site.id, name: String(form.get("name") ?? "") })).id;
  } catch (err) {
    return { error: message(err) };
  }
  redirect(`/forms/${id}`);
}

/** The editor autosaves the whole form a moment after a change. */
export async function saveFormAction(formId: string, settings: unknown): Promise<FormState> {
  const { user, site } = await requireSiteAccess();
  try {
    await updateForm({ actorId: user.id, siteId: site.id, formId, settings });
    revalidatePath("/forms");
    return { ok: "Saved" };
  } catch (err) {
    return { error: message(err) };
  }
}

export async function reorderFormsAction(order: string[]): Promise<FormState> {
  const { user, site } = await requireSiteAccess();
  try {
    await reorderForms({ actorId: user.id, siteId: site.id, order: z.array(z.string().uuid()).max(200).parse(order) });
    revalidatePath("/forms");
    return { ok: "Saved" };
  } catch (err) {
    return { error: message(err) };
  }
}

export async function deleteFormAction(form: FormData): Promise<void> {
  const { user, site } = await requireSiteAccess();
  await deleteForm({ actorId: user.id, siteId: site.id, formId: String(form.get("formId")) });
  revalidatePath("/forms");
  redirect("/forms");
}

export async function setSubmissionStatusAction(form: FormData): Promise<void> {
  const { user, site } = await requireSiteAccess();
  await setSubmissionStatus({
    actorId: user.id,
    siteId: site.id,
    submissionId: String(form.get("submissionId")),
    status: z.enum(SUBMISSION_STATUSES).parse(form.get("status")),
  });
  revalidatePath("/inbox");
  revalidatePath("/", "layout");
}

/**
 * A visitor sends a form from the storefront. No sign-in: the site is the
 * one the hostname names, and the form must belong to it. Answers come
 * in as f_<fieldId>; `website` is the hidden trap field.
 */
export async function submitFormAction(formId: string, _prev: FormState, form: FormData): Promise<FormState> {
  const h = await headers();
  const host = h.get("x-oi-host") ?? h.get("host") ?? "";
  const site = await siteFromHost(host);
  if (!site) return { error: "This form isn't available." };
  const answers: Record<string, string> = {};
  for (const [k, v] of form.entries()) if (k.startsWith("f_") && typeof v === "string") answers[k.slice(2)] = v;
  try {
    const r = await submitForm({
      siteId: site.id,
      formId,
      answers,
      trap: String(form.get("website") ?? ""),
      siteName: site.name,
      inboxUrl: `https://${host.replace(/^[^.]+\./, "admin.")}/inbox`,
    });
    return { ok: r.message };
  } catch (err) {
    return { error: message(err) };
  }
}
