"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireSiteAccess } from "@/modules/auth/access";
import { addNote, createContact, deleteContact, updateContact } from "./server";

export type FormState = { ok?: string; error?: string };

function message(err: unknown): string {
  if (err instanceof z.ZodError) return err.issues[0]?.message ?? "That doesn't look right.";
  if (err instanceof Error) return err.message;
  return "Something went wrong. Try again.";
}

export async function createContactAction(_prev: FormState, form: FormData): Promise<FormState> {
  const { user, site } = await requireSiteAccess();
  let id: string;
  try {
    id = (await createContact({ actorId: user.id, siteId: site.id, details: { name: form.get("name") ?? "", email: form.get("email") ?? "", phone: form.get("phone") ?? "" } })).id;
  } catch (err) {
    return { error: message(err) };
  }
  redirect(`/contacts/${id}`);
}

/** The details autosave a moment after typing stops. */
export async function saveContactAction(contactId: string, details: unknown): Promise<FormState> {
  const { user, site } = await requireSiteAccess();
  try {
    await updateContact({ actorId: user.id, siteId: site.id, contactId, details });
    revalidatePath("/contacts");
    return { ok: "Saved" };
  } catch (err) {
    return { error: message(err) };
  }
}

export async function addNoteAction(_prev: FormState, form: FormData): Promise<FormState> {
  const { user, site } = await requireSiteAccess();
  try {
    await addNote({ actorId: user.id, siteId: site.id, contactId: String(form.get("contactId")), text: String(form.get("text") ?? "") });
    revalidatePath("/contacts");
    return { ok: "Added" };
  } catch (err) {
    return { error: message(err) };
  }
}

export async function deleteContactAction(form: FormData): Promise<void> {
  const { user, site } = await requireSiteAccess();
  await deleteContact({ actorId: user.id, siteId: site.id, contactId: String(form.get("contactId")) });
  revalidatePath("/contacts");
  redirect("/contacts");
}
